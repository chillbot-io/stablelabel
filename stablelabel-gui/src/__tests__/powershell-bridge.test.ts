// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  let bridge: InstanceType<typeof PowerShellBridge>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    spawnedProcesses.length = 0;
    bridge = new PowerShellBridge('/path/to/StableLabel');
  });

  afterEach(() => {
    vi.useRealTimers();
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

    it('times out after 10 seconds', async () => {
      const resultPromise = bridge.checkPwshAvailable();
      // Advance past the 10-second timeout
      vi.advanceTimersByTime(11000);
      const result = await resultPromise;
      expect(result.available).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('invoke', () => {
    it('initializes process on first invoke', async () => {
      const invokePromise = bridge.invoke('Get-SLLabel');

      // First spawn is for ensureInitialized
      const initProc = lastProc();
      expect(spawn).toHaveBeenCalled();

      // Simulate the Import-Module command completing (first sendRaw from ensureInitialized)
      const importWrite = initProc.stdin.write.mock.calls[0]?.[0] as string;
      expect(importWrite).toContain('Import-Module');
      // Extract the marker from the command
      const importMarker = importWrite.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (importMarker) {
        initProc.stdout.emit('data', Buffer.from(`ok\n${importMarker}\n`));
      }

      // Now the actual command should be sent
      await vi.advanceTimersByTimeAsync(10);

      // Find the Get-SLLabel command write
      const cmdWrite = initProc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('Get-SLLabel')
      )?.[0] as string;
      expect(cmdWrite).toContain('Get-SLLabel');
      expect(cmdWrite).toContain('-AsJson'); // Should auto-append -AsJson

      // Extract marker and resolve
      const cmdMarker = cmdWrite?.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (cmdMarker) {
        initProc.stdout.emit('data', Buffer.from(`[{"Name":"Confidential"}]\n${cmdMarker}\n`));
      }

      const result = await invokePromise;
      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ Name: 'Confidential' }]);
      expect(bridge.isInitialized()).toBe(true);
    });

    it('does not append -AsJson when already present', async () => {
      const invokePromise = bridge.invoke('Get-SLLabel -AsJson');

      const proc = lastProc();
      // Complete Import-Module
      const importWrite = proc.stdin.write.mock.calls[0]?.[0] as string;
      const importMarker = importWrite.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (importMarker) {
        proc.stdout.emit('data', Buffer.from(`ok\n${importMarker}\n`));
      }

      await vi.advanceTimersByTimeAsync(10);

      const cmdWrite = proc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('Get-SLLabel')
      )?.[0] as string;
      // Should not double-add -AsJson
      const asJsonCount = (cmdWrite.match(/-AsJson/g) || []).length;
      expect(asJsonCount).toBe(1);

      const cmdMarker = cmdWrite?.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (cmdMarker) {
        proc.stdout.emit('data', Buffer.from(`"test"\n${cmdMarker}\n`));
      }

      await invokePromise;
    });

    it('returns non-JSON output as string data', async () => {
      const invokePromise = bridge.invoke('Get-SLLabel');

      const proc = lastProc();
      const importWrite = proc.stdin.write.mock.calls[0]?.[0] as string;
      const importMarker = importWrite.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (importMarker) {
        proc.stdout.emit('data', Buffer.from(`ok\n${importMarker}\n`));
      }

      await vi.advanceTimersByTimeAsync(10);

      const cmdWrite = proc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('Get-SLLabel')
      )?.[0] as string;
      const cmdMarker = cmdWrite?.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (cmdMarker) {
        proc.stdout.emit('data', Buffer.from(`not valid json\n${cmdMarker}\n`));
      }

      const result = await invokePromise;
      expect(result.success).toBe(true);
      expect(result.data).toBe('not valid json');
    });

    it('returns error when process is not available', async () => {
      // Mock spawn to return a process with null stdin
      const badProc = createMockProcess();
      (badProc as any).stdin = null;
      (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(badProc);

      const result = await bridge.invoke('Get-SLLabel');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('uses win32 exe name for init process', async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue('win32');
      const winBridge = new PowerShellBridge('/path/to/StableLabel');
      winBridge.invoke('Get-SLLabel');

      expect(spawn).toHaveBeenCalledWith(
        'pwsh.exe',
        expect.any(Array),
        expect.any(Object),
      );
      (platform as ReturnType<typeof vi.fn>).mockReturnValue('linux');
    });

    it('escapes single quotes in module path', async () => {
      const quoteBridge = new PowerShellBridge("/path/to/it's here/StableLabel");
      quoteBridge.invoke('Get-SLLabel');

      const proc = lastProc();
      const importWrite = proc.stdin.write.mock.calls[0]?.[0] as string;
      expect(importWrite).toContain("it''s here");
    });

    it('handles process close during operation', async () => {
      const invokePromise = bridge.invoke('Get-SLLabel');
      const proc = lastProc();

      // Complete import
      const importWrite = proc.stdin.write.mock.calls[0]?.[0] as string;
      const importMarker = importWrite.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (importMarker) {
        proc.stdout.emit('data', Buffer.from(`ok\n${importMarker}\n`));
      }

      await vi.advanceTimersByTimeAsync(10);

      // Simulate process closing
      proc.emit('close', 1);

      // The command should timeout after 600s
      vi.advanceTimersByTime(610000);

      const result = await invokePromise;
      expect(result.success).toBe(false);
    });

    it('logs stderr output', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      bridge.invoke('Get-SLLabel');
      const proc = lastProc();
      proc.stderr.emit('data', Buffer.from('Warning: something'));
      expect(consoleSpy).toHaveBeenCalledWith('[PS STDERR]', 'Warning: something');
      consoleSpy.mockRestore();
    });

    it('logs when process exits', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      bridge.invoke('Get-SLLabel');
      const proc = lastProc();
      proc.emit('close', 0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('exited with code 0'));
      consoleSpy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('does nothing when no process exists', () => {
      bridge.dispose();
      expect(bridge.isInitialized()).toBe(false);
    });

    it('sends exit command and kills process after delay', async () => {
      // Initialize the bridge first
      bridge.invoke('Get-SLLabel');
      const proc = lastProc();

      // Complete initialization
      const importWrite = proc.stdin.write.mock.calls[0]?.[0] as string;
      const importMarker = importWrite.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
      if (importMarker) {
        proc.stdout.emit('data', Buffer.from(`ok\n${importMarker}\n`));
      }

      await vi.advanceTimersByTimeAsync(10);

      bridge.dispose();
      expect(proc.stdin.write).toHaveBeenCalledWith('exit\n');
      expect(bridge.isInitialized()).toBe(false);

      // After 2s delay, process should be killed
      vi.advanceTimersByTime(2500);
      expect(proc.kill).toHaveBeenCalled();
    });
  });
});
