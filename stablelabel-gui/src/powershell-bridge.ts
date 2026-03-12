import { spawn, ChildProcess } from 'node:child_process';
import { platform } from 'node:os';

interface PsResult {
  success: boolean;
  data: unknown;
  error?: string;
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
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[PS STDERR]', data.toString());
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
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('PowerShell process not available'));
        return;
      }

      this.outputBuffer = '';

      // Use a unique marker to know when output is complete
      const marker = `___SL_DONE_${Date.now()}___`;
      const wrappedCommand = `${command}\nWrite-Output '${marker}'\n`;

      const checkOutput = setInterval(() => {
        if (this.outputBuffer.includes(marker)) {
          clearInterval(checkOutput);
          const output = this.outputBuffer.split(marker)[0].trim();
          this.outputBuffer = '';
          resolve(output);
        }
      }, 50);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkOutput);
        reject(new Error(`Command timed out: ${command.substring(0, 100)}`));
      }, 300000);

      this.process.stdin.write(wrappedCommand);
    });
  }

  async invoke(command: string): Promise<PsResult> {
    try {
      await this.ensureInitialized();

      // All GUI commands use -AsJson for machine-readable output
      const psCommand = command.includes('-AsJson') ? command : `${command} -AsJson`;
      const output = await this.sendRaw(psCommand);

      try {
        const data = JSON.parse(output);
        return { success: true, data };
      } catch {
        // If not valid JSON, return as string
        return { success: true, data: output };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, error: message };
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
