import { spawn, ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildCommand } from './cmdlet-registry';
import { ALLOWED_DEVICE_CODE_HOSTS } from './trusted-hosts';
import { logger } from './logger';

const PS_READY_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 600_000;
const PROCESS_CLEANUP_DELAY_MS = 2_000;

interface PsResult {
  success: boolean;
  data: unknown;
  error?: string;
}

/** Strip ANSI escape sequences (colors, cursor moves, etc.) from a string. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Manages a persistent PowerShell 7 process for communicating with the StableLabel module.
 * Commands are sent via stdin, JSON responses read from stdout.
 *
 * For AIPService (Protection functions), a separate Windows PowerShell 5.1 process
 * is spawned on-demand (Windows only).
 */
export class PowerShellBridge {
  private process: ChildProcess | null = null;
  private modulePath: string;
  private _initialized = false;
  private commandQueue: Array<{
    command: string;
    resolve: (value: PsResult) => void;
    reject: (reason: Error) => void;
  }> = [];
  private processing = false;
  private outputBuffer = '';
  private stderrBuffer = '';
  private currentMarker: string | null = null;
  private currentResolve: ((output: string) => void) | null = null;

  /** Callback invoked when a device-code authentication message is detected in stdout. */
  onDeviceCode: ((info: { userCode: string; verificationUrl: string; message: string }) => void) | null = null;

  /** Tracks the last device code that was fired so we skip stale matches.
   *  Connect-SLAll triggers TWO device-code prompts (Graph then Compliance).
   *  Without this, the accumulated outputBuffer causes the regex to re-match
   *  the already-used Graph code instead of the new Compliance code. */
  private lastFiredDeviceCode: string | null = null;

  constructor(modulePath: string) {
    this.modulePath = modulePath;
  }

  /**
   * Check a text chunk for a device-code authentication prompt and fire the callback.
   * Connect-MgGraph uses WriteWarning (stream 3) and Connect-IPPSSession may use
   * Write-Host (stream 6). With 3>&1 6>&1 both reach stdout, but we also check
   * stderr as a fallback.
   *
   * The verification URL is validated against a known Microsoft domain allowlist
   * to prevent phishing via crafted PowerShell output.
   */
  private checkForDeviceCode(text: string): void {
    if (!this.onDeviceCode) return;
    const clean = stripAnsi(text);

    // Log when we detect a potential device-code related keyword for diagnostics
    if (/devicelogin|devicecode|deviceauth|sign\s*in/i.test(clean)) {
      logger.info('PS_BRIDGE', `Potential device-code text detected (${clean.length} chars)`);
    }

    // Try multiple patterns — MSAL message format varies across SDK versions.
    // Use global flag + matchAll so we can skip stale codes and find new ones.
    // Connect-SLAll produces TWO device codes (Graph then Compliance) in the
    // same accumulated buffer; we must skip the already-fired one.
    const patterns = [
      // Broad pattern: any mention of a Microsoft URL followed by a device code
      /(?:open(?:\s+the\s+page)?|visit|go\s+to|browse\s+to|navigate\s+to)\s+(https:\/\/\S+)\s+and\s+(?:enter|use|input|type)\s+(?:the\s+)?code:?\s+([A-Z0-9]{5,15})/gi,
      // Fallback: devicelogin URL anywhere, then a standalone code nearby
      /(https:\/\/\S*(?:devicelogin|devicecode|deviceauth)\S*)\S*\s[\s\S]{0,120}?\bcode:?\s+([A-Z0-9]{5,15})/gi,
      // Reverse order: code appears before URL (some MSAL versions)
      /\bcode:?\s+([A-Z0-9]{5,15})\b[\s\S]{0,120}?(https:\/\/\S*(?:devicelogin|devicecode|deviceauth)\S*)/gi,
    ];

    for (let pi = 0; pi < patterns.length; pi++) {
      const pattern = patterns[pi];
      for (const match of clean.matchAll(pattern)) {
        // Pattern 3 (index 2) has groups reversed: code=group1, url=group2
        const rawUrl = pi === 2 ? match[2] : match[1];
        const rawCode = pi === 2 ? match[1] : match[2];

        // Strip trailing punctuation from URL (periods, commas)
        const url = rawUrl.replace(/[.,;:]+$/, '');

        // Validate URL domain against allowlist
        let trusted = false;
        try {
          const hostname = new URL(url).hostname;
          trusted = ALLOWED_DEVICE_CODE_HOSTS.some(
            (d) => hostname === d || hostname.endsWith(`.${d}`),
          );
          if (!trusted) {
            logger.error('PS_BRIDGE', `Rejected untrusted device-code URL: ${url}`);
          }
        } catch {
          logger.error('PS_BRIDGE', `Invalid device-code URL: ${url}`);
        }
        if (!trusted) continue;

        const userCode = rawCode.toUpperCase();

        // Skip if this is the same code we already fired — prevents re-sending
        // a stale Graph code when the Compliance code arrives in the same buffer.
        if (userCode === this.lastFiredDeviceCode) continue;

        this.lastFiredDeviceCode = userCode;
        this.onDeviceCode({
          verificationUrl: url,
          userCode,
          message: clean.trim(),
        });
        return; // Fire only the newest unhandled code
      }
    }
  }

  async checkPwshAvailable(): Promise<{ available: boolean; path?: string; error?: string }> {
    return new Promise((resolve) => {
      const pwshName = platform() === 'win32' ? 'pwsh.exe' : 'pwsh';
      const proc = spawn(pwshName, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']);

      let output = '';
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ available: true, path: pwshName });
        } else {
          resolve({
            available: false,
            error: 'PowerShell 7 (pwsh) is required. Install from: https://aka.ms/powershell',
          });
        }
      });

      proc.on('error', () => {
        resolve({
          available: false,
          error: 'PowerShell 7 (pwsh) not found. Install from: https://aka.ms/powershell',
        });
      });

      setTimeout(() => {
        proc.kill();
        resolve({ available: false, error: 'PowerShell check timed out' });
      }, PS_READY_TIMEOUT_MS);
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (this._initialized && this.process) return;

    const pwshName = platform() === 'win32' ? 'pwsh.exe' : 'pwsh';

    this.process = spawn(pwshName, [
      '-NoProfile',
      '-NoLogo',
      '-NonInteractive',
      '-Command',
      '-',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.outputBuffer += data.toString();

      // Device code prompt may arrive via stdout (Information stream redirect)
      this.checkForDeviceCode(this.outputBuffer);

      // Check if the current command's marker has arrived
      if (this.currentMarker && this.outputBuffer.includes(this.currentMarker)) {
        const output = this.outputBuffer.split(this.currentMarker)[0].trim();
        this.outputBuffer = '';
        const resolve = this.currentResolve;
        this.currentMarker = null;
        this.currentResolve = null;
        resolve?.(output);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      logger.error('PS_STDERR', text);
      this.stderrBuffer += text;

      // Fallback: check accumulated stderr in case warnings bypass 3>&1 redirect
      this.checkForDeviceCode(this.stderrBuffer);
    });

    this.process.on('close', (code) => {
      logger.info('PS_BRIDGE', `PowerShell process exited with code ${code}`);
      this._initialized = false;
      this.process = null;
    });

    // Force stdout/stderr auto-flush so device-code messages (and all other
    // output) are delivered immediately over the pipe instead of sitting in
    // .NET's StreamWriter buffer.  Without this, Connect-MgGraph -UseDeviceCode
    // writes the "To sign in…" message but it never reaches Node because the
    // pipe is block-buffered when stdout is not a terminal.
    //
    // Two-pronged approach:
    //
    // 1. Use reflection to enable AutoFlush on the ORIGINAL Console.Out /
    //    Console.Error inner StreamWriters.  PowerShell's ConsoleHost caches
    //    references to these writers at startup.  Console.SetOut() alone does
    //    NOT affect the cached references, so host-level writes (like the
    //    device-code warning from Connect-MgGraph) go through the originals
    //    and stay block-buffered.  By reaching into the SyncTextWriter's
    //    private `_out` field and flipping AutoFlush on the underlying
    //    StreamWriter, all writes — even through cached references — flush
    //    immediately.
    //
    // 2. Replace Console.Out / Console.Error with new StreamWriter instances
    //    that have AutoFlush = $true (the previous approach, kept as a
    //    belt-and-suspenders measure for any code path that reads the
    //    Console.Out / Console.Error properties directly).
    await this.sendRaw(
      // ── Reflection: fix the ORIGINAL writers ──
      '$_bf = [System.Reflection.BindingFlags]"NonPublic,Instance"; ' +
      'foreach ($_w in @([Console]::Out, [Console]::Error)) { ' +
      '  $_f = $_w.GetType().GetField("_out", $_bf); ' +
      '  if ($_f) { ' +
      '    $_inner = $_f.GetValue($_w); ' +
      '    if ($_inner -is [System.IO.StreamWriter]) { $_inner.AutoFlush = $true } ' +
      '  } ' +
      '}; ' +
      // ── Replace writers (belt-and-suspenders) ──
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
      '$_sw = [System.IO.StreamWriter]::new([Console]::OpenStandardOutput(), [Console]::OutputEncoding); ' +
      '$_sw.AutoFlush = $true; ' +
      '[Console]::SetOut($_sw); ' +
      '$_ew = [System.IO.StreamWriter]::new([Console]::OpenStandardError(), [Console]::OutputEncoding); ' +
      '$_ew.AutoFlush = $true; ' +
      '[Console]::SetError($_ew); ' +
      'if ($PSStyle) { $PSStyle.OutputRendering = "PlainText" }',
    );

    // Import the StableLabel module
    const escapedPath = this.modulePath.replace(/'/g, "''");
    await this.sendRaw(`Import-Module '${escapedPath}' -Force`);
    this._initialized = true;
  }

  private sendRaw(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('PowerShell process not available'));
        return;
      }
      this.commandQueue.push({ command, resolve: resolve as (value: PsResult) => void, reject });
      this.processQueue();
    }) as Promise<string>;
  }

  private processQueue(): void {
    if (this.processing || this.commandQueue.length === 0) return;
    this.processing = true;

    const { command, resolve, reject } = this.commandQueue.shift()!;

    if (!this.process?.stdin) {
      this.processing = false;
      reject(new Error('PowerShell process not available'));
      this.processQueue();
      return;
    }

    this.outputBuffer = '';
    this.stderrBuffer = '';
    this.lastFiredDeviceCode = null;
    const marker = `___SL_DONE_${randomUUID()}___`;
    // Redirect Warning (3) and Information (6) streams to stdout so device-code
    // prompts from Connect-MgGraph (WriteWarning) and Connect-IPPSSession reach
    // the bridge regardless of which stream the cmdlet uses.
    const wrappedCommand = `& { ${command} } 3>&1 6>&1\nWrite-Output '${marker}'\n`;

    const timeout = setTimeout(() => {
      this.currentMarker = null;
      this.currentResolve = null;
      this.processing = false;
      reject(new Error(`Command timed out: ${command.substring(0, 100)}`));
      this.processQueue();
    }, COMMAND_TIMEOUT_MS);

    this.currentMarker = marker;
    this.currentResolve = (output: string) => {
      clearTimeout(timeout);
      this.processing = false;
      (resolve as unknown as (value: string) => void)(output);
      this.processQueue();
    };

    this.process.stdin.write(wrappedCommand);
  }

  /**
   * Invoke a structured command. The cmdlet name is validated against the
   * allowlist and the command string is built server-side with proper escaping.
   * This is the only public entry point for command execution.
   */
  async invokeStructured(
    cmdlet: string,
    params: Record<string, unknown> = {},
  ): Promise<PsResult> {
    try {
      // buildCommand validates the cmdlet and params against the registry
      const command = buildCommand(cmdlet, params);
      return await this.invokeRaw(command);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, error: stripAnsi(message) };
    }
  }

  /**
   * Execute an already-validated command string. Internal use only.
   */
  private async invokeRaw(command: string): Promise<PsResult> {
    try {
      await this.ensureInitialized();

      // All GUI commands use -AsJson for machine-readable output
      const psCommand = command.includes('-AsJson') ? command : `${command} -AsJson`;
      const output = await this.sendRaw(psCommand);

      // Strip ANSI escape codes from output (PowerShell may emit colored warnings)
      const cleanOutput = stripAnsi(output);

      // If stdout is empty but stderr has content, the command likely errored
      if (!cleanOutput && this.stderrBuffer.trim()) {
        return { success: false, data: null, error: stripAnsi(this.stderrBuffer.trim()) };
      }

      try {
        const data = JSON.parse(cleanOutput);
        return { success: true, data };
      } catch {
        // PowerShell may emit warnings before JSON — try to extract JSON object/array
        const jsonStart = cleanOutput.search(/[{\[]/);
        if (jsonStart > 0) {
          const jsonCandidate = cleanOutput.slice(jsonStart);
          try {
            const data = JSON.parse(jsonCandidate);
            return { success: true, data };
          } catch {
            // fall through
          }
        }
        // If not valid JSON, return as string
        return { success: true, data: cleanOutput || null };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, error: stripAnsi(message) };
    }
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  dispose(): void {
    if (this.process) {
      try {
        this.process.stdin?.write('exit\n');
      } catch {
        // Process may already be dead
      }
      setTimeout(() => {
        this.process?.kill();
        this.process = null;
      }, PROCESS_CLEANUP_DELAY_MS);
      this._initialized = false;
    }
  }
}
