// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Create a mock process factory
function createMockProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: { write: ReturnType<typeof vi.fn> };
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = { write: vi.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

// Store all created processes so tests can find them
const spawnedProcesses: ReturnType<typeof createMockProcess>[] = [];

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const proc = createMockProcess();
      spawnedProcesses.push(proc);
      return proc;
    }),
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: vi.fn(() => 'linux'),
  };
});

const { spawn } = await import('node:child_process');
const { platform } = await import('node:os');
const { PowerShellBridge } = await import('../powershell-bridge');

function lastProc() {
  return spawnedProcesses[spawnedProcesses.length - 1];
}

describe('PowerShellBridge', () => {
  let bridge: PowerShellBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    spawnedProcesses.length = 0;
    bridge = new PowerShellBridge('/path/to/StableLabel');
  });

  describe('constructor', () => {
    it('initializes as not initialized', () => {
      expect(bridge.isInitialized()).toBe(false);
    });
  });

  describe('checkPwshAvailable', () => {
    it('returns available true when pwsh exits with code 0', async () => {
      const resultPromise = bridge.checkPwshAvailable();
      const proc = lastProc();
      proc.stdout.emit('data', Buffer.from('7.4.0'));
      proc.emit('close', 0);

      const result = await resultPromise;
      expect(result.available).toBe(true);
      expect(result.path).toBe('pwsh');
    });

    it('returns available false when pwsh exits with non-zero', async () => {
      const resultPromise = bridge.checkPwshAvailable();
      const proc = lastProc();
      proc.emit('close', 1);

      const result = await resultPromise;
      expect(result.available).toBe(false);
      expect(result.error).toContain('PowerShell 7');
    });

    it('returns available false on spawn error', async () => {
      const resultPromise = bridge.checkPwshAvailable();
      const proc = lastProc();
      proc.emit('error', new Error('ENOENT'));

      const result = await resultPromise;
      expect(result.available).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('uses pwsh.exe on win32', async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValueOnce('win32');
      const resultPromise = bridge.checkPwshAvailable();
      const proc = lastProc();
      proc.emit('close', 0);
      await resultPromise;

      expect(spawn).toHaveBeenCalledWith('pwsh.exe', expect.any(Array));
    });
  });

  describe('dispose', () => {
    it('does nothing when no process exists', () => {
      bridge.dispose();
      expect(bridge.isInitialized()).toBe(false);
    });
  });
});
