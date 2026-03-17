import { spawn, ChildProcess } from 'node:child_process';
import { platform } from 'node:os';

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

  constructor(modulePath: string) {
    this.modulePath = modulePath;
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
      }, 10000);
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

      // Detect device-code auth prompt emitted by Connect-MgGraph -UseDeviceCode
      // Typical message: "To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code XXXXXXXX to authenticate."
      const clean = stripAnsi(this.outputBuffer);
      const deviceCodeMatch = clean.match(
        /open the page (https:\/\/\S+) and enter the code ([A-Z0-9]{6,12})/i,
      );
      if (deviceCodeMatch && this.onDeviceCode) {
        this.onDeviceCode({
          verificationUrl: deviceCodeMatch[1],
          userCode: deviceCodeMatch[2],
          message: clean.trim(),
        });
        // Only fire once per command
        this.onDeviceCode = null;
      }

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
      console.error('[PS STDERR]', text);
      this.stderrBuffer += text;
    });

    this.process.on('close', (code) => {
      console.log(`PowerShell process exited with code ${code}`);
      this._initialized = false;
      this.process = null;
    });

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
    const marker = `___SL_DONE_${Date.now()}_${Math.random().toString(36).slice(2)}___`;
    const wrappedCommand = `${command}\nWrite-Output '${marker}'\n`;

    const timeout = setTimeout(() => {
      this.currentMarker = null;
      this.currentResolve = null;
      this.processing = false;
      reject(new Error(`Command timed out: ${command.substring(0, 100)}`));
      this.processQueue();
    }, 300000);

    this.currentMarker = marker;
    this.currentResolve = (output: string) => {
      clearTimeout(timeout);
      this.processing = false;
      (resolve as unknown as (value: string) => void)(output);
      this.processQueue();
    };

    this.process.stdin.write(wrappedCommand);
  }

  async invoke(command: string): Promise<PsResult> {
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
      }, 2000);
      this._initialized = false;
    }
  }
}
