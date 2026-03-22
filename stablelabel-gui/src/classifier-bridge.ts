import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { logger } from './logger';

const STARTUP_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 120_000;
const AVAILABILITY_CHECK_TIMEOUT_MS = 15_000;
const PROCESS_CLEANUP_DELAY_MS = 2_000;

export interface ClassifierResult {
  success: boolean;
  data: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: ClassifierResult) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface QueueEntry {
  id: string;
  payload: string;
  resolve: (value: ClassifierResult) => void;
  reject: (reason: Error) => void;
}

/**
 * Manages a persistent Python classifier process (Presidio + spaCy).
 * Commands are sent as JSON over stdin, responses read from stdout.
 * Uses a command queue to prevent concurrent stdin writes.
 */
export class ClassifierBridge {
  private process: ChildProcess | null = null;
  private _initialized = false;
  private _initializing: Promise<void> | null = null;
  private outputBuffer = '';
  private pendingRequests = new Map<string, PendingRequest>();
  private commandQueue: QueueEntry[] = [];
  private writing = false;

  /**
   * Resolve the path to the classifier executable or script.
   * In packaged mode: look for the PyInstaller exe in resources.
   * In dev mode: spawn Python directly with the script.
   */
  private getExecutable(): { command: string; args: string[] } {
    if (app.isPackaged) {
      const exeName = platform() === 'win32'
        ? 'stablelabel-classifier.exe'
        : 'stablelabel-classifier';
      // PyInstaller --onedir output: resources/stablelabel-classifier/<exeName>
      const exePath = path.join(process.resourcesPath, 'stablelabel-classifier', exeName);
      if (existsSync(exePath)) {
        return { command: exePath, args: [] };
      }
      // Bundled exe not found — do NOT fall back to dev mode in production
      logger.error('CLASSIFIER', `Bundled classifier not found at ${exePath}`);
      return { command: exePath, args: [] };
    }

    // Dev mode: use Python directly
    const scriptPath = path.join(__dirname, '..', '..', '..', 'stablelabel-classifier', 'classifier_service.py');
    const pythonCmd = platform() === 'win32' ? 'python' : 'python3';
    return { command: pythonCmd, args: [scriptPath] };
  }

  /**
   * Check if the classifier is available (exe exists or python + deps are installed).
   */
  async checkAvailable(): Promise<{ available: boolean; mode?: string; error?: string }> {
    const { command, args } = this.getExecutable();

    if (app.isPackaged && args.length === 0) {
      // Bundled exe mode
      return existsSync(command)
        ? { available: true, mode: 'bundled' }
        : { available: false, error: 'Classifier executable not found in app resources.' };
    }

    // Dev mode: check if python and presidio are available
    return new Promise((resolve) => {
      let resolved = false;
      const done = (result: { available: boolean; mode?: string; error?: string }) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      const proc = spawn(command, ['-c', 'import presidio_analyzer; print("ok")']);
      let output = '';
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && output.includes('ok')) {
          done({ available: true, mode: 'python' });
        } else {
          done({
            available: false,
            error: 'Python 3 with presidio-analyzer not found. Run: pip install presidio-analyzer spacy && python -m spacy download en_core_web_lg',
          });
        }
      });
      proc.on('error', () => {
        done({ available: false, error: `${command} not found on PATH.` });
      });
      setTimeout(() => {
        proc.kill();
        done({ available: false, error: 'Python check timed out.' });
      }, AVAILABILITY_CHECK_TIMEOUT_MS);
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (this._initialized && this.process) return;
    if (this._initializing) return this._initializing;

    this._initializing = this._doInit();
    try {
      await this._initializing;
    } finally {
      this._initializing = null;
    }
  }

  private async _doInit(): Promise<void> {
    const { command, args } = this.getExecutable();
    logger.info('CLASSIFIER', `Starting classifier: ${command} ${args.join(' ')}`);

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      logger.error('CLASSIFIER_STDERR', data.toString());
    });

    this.process.on('close', (code) => {
      logger.info('CLASSIFIER', `Classifier process exited with code ${code}`);
      this._initialized = false;
      this.process = null;
      // Reject all pending requests safely (snapshot then clear)
      const pending = Array.from(this.pendingRequests.values());
      this.pendingRequests.clear();
      for (const req of pending) {
        clearTimeout(req.timeout);
        req.reject(new Error('Classifier process exited unexpectedly'));
      }
      // Drain queued commands that haven't been sent yet
      const queued = [...this.commandQueue];
      this.commandQueue = [];
      this.writing = false;
      for (const entry of queued) {
        entry.resolve({ success: false, data: null, error: 'Classifier process exited unexpectedly' });
      }
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.outputBuffer += data.toString();
      this._processBuffer();
    });

    // Wait for the startup "ready" message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete('__startup__');
        reject(new Error('Classifier startup timed out'));
      }, STARTUP_TIMEOUT_MS);

      this.pendingRequests.set('__startup__', {
        resolve: () => {
          clearTimeout(timeout);
          this._initialized = true;
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        timeout,
      });
    });
  }

  private _processBuffer(): void {
    const lines = this.outputBuffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    this.outputBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed);
        const id = response.id;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(id);
          if (id === '__startup__') {
            // Startup handler: resolve signals readiness, result value is unused
            pending.resolve({ success: true, data: response.data });
          } else {
            pending.resolve({
              success: response.success ?? true,
              data: response.data ?? null,
              error: response.error,
            });
          }
        }
      } catch {
        logger.error('CLASSIFIER', `Failed to parse response: ${trimmed.substring(0, 200)}`);
      }
    }
  }

  /**
   * Write the next queued command to stdin. Processes one at a time.
   */
  private processQueue(): void {
    if (this.writing || this.commandQueue.length === 0) return;
    this.writing = true;

    const entry = this.commandQueue.shift()!;

    if (!this.process?.stdin) {
      this.writing = false;
      entry.resolve({ success: false, data: null, error: 'Classifier process not available' });
      this.processQueue();
      return;
    }

    const timeout = setTimeout(() => {
      this.pendingRequests.delete(entry.id);
      entry.resolve({ success: false, data: null, error: 'Classifier request timed out' });
      this.writing = false;
      this.processQueue();
    }, COMMAND_TIMEOUT_MS);

    // Store the resolve/reject in pendingRequests so _processBuffer can route the response
    this.pendingRequests.set(entry.id, {
      resolve: (result) => {
        entry.resolve(result);
        this.writing = false;
        this.processQueue();
      },
      reject: (err) => {
        entry.reject(err);
        this.writing = false;
        this.processQueue();
      },
      timeout,
    });

    try {
      this.process.stdin.write(entry.payload + '\n');
    } catch (err) {
      clearTimeout(timeout);
      this.pendingRequests.delete(entry.id);
      const message = err instanceof Error ? err.message : String(err);
      entry.resolve({ success: false, data: null, error: message });
      this.writing = false;
      this.processQueue();
    }
  }

  /**
   * Send a request to the classifier and wait for the response.
   */
  async invoke(action: string, params: Record<string, unknown> = {}): Promise<ClassifierResult> {
    try {
      await this.ensureInitialized();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, error: message };
    }

    const id = randomUUID();
    const payload = JSON.stringify({ id, action, ...params });

    return new Promise<ClassifierResult>((resolve, reject) => {
      this.commandQueue.push({ id, payload, resolve, reject });
      this.processQueue();
    });
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  dispose(): void {
    if (this.process) {
      const proc = this.process;
      this._initialized = false;
      this.process = null;

      // Reject pending requests
      const pending = Array.from(this.pendingRequests.values());
      this.pendingRequests.clear();
      for (const req of pending) {
        clearTimeout(req.timeout);
        req.reject(new Error('Classifier bridge disposed'));
      }

      try {
        proc.stdin?.end();
      } catch {
        // Process may already be dead
      }
      setTimeout(() => {
        proc.kill();
      }, PROCESS_CLEANUP_DELAY_MS);
    }
  }
}
