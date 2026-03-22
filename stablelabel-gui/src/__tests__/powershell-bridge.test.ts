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

/**
 * Helper: complete all init commands (AutoFlush + Import-Module) for a process.
 * The bridge sends two sequential commands during init; the second is only
 * queued after the first resolves, so we must emit markers one at a time
 * with async ticks in between.
 */
async function completeInit(proc: ReturnType<typeof createMockProcess>) {
  // Complete the first queued command (AutoFlush setup)
  const firstWrite = proc.stdin.write.mock.calls[0]?.[0] as string | undefined;
  const firstMarker = firstWrite?.match(/Write-Output '(___SL_DONE_[^']+)'/)?.[1];
  if (firstMarker) {
    proc.stdout.emit('data', Buffer.from(`ok\n${firstMarker}\n`));
  }

  // Allow the bridge to queue the Import-Module command
  await vi.advanceTimersByTimeAsync(10);

  // Complete the Import-Module command
  const importCall = proc.stdin.write.mock.calls.find((c: string[]) =>
    c[0]?.includes('Import-Module'),
  );
  const importMarker = (importCall?.[0] as string | undefined)?.match(/Write-Output '(___SL_DONE_[^']+)'/)?.[1];
  if (importMarker) {
    proc.stdout.emit('data', Buffer.from(`ok\n${importMarker}\n`));
  }
}

/** Helper: find a command write and complete it with a response */
function completeCommand(proc: ReturnType<typeof createMockProcess>, cmdletName: string, response: string) {
  const cmdWrite = proc.stdin.write.mock.calls.find((c: string[]) =>
    c[0]?.includes(cmdletName)
  )?.[0] as string;
  const cmdMarker = cmdWrite?.split('\n').find((l: string) => l.startsWith("Write-Output '___SL_DONE_"))?.match(/'(.+)'/)?.[1];
  if (cmdMarker) {
    proc.stdout.emit('data', Buffer.from(`${response}\n${cmdMarker}\n`));
  }
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

  describe('invokeStructured', () => {
    it('rejects disallowed cmdlets', async () => {
      const result = await bridge.invokeStructured('Invoke-Expression', { Command: 'whoami' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in the allowlist');
    });

    it('initializes process on first invoke', async () => {
      const invokePromise = bridge.invokeStructured('Get-SLLabel');

      const initProc = lastProc();
      expect(spawn).toHaveBeenCalled();

      // Complete Import-Module
      await completeInit(initProc);
      await vi.advanceTimersByTimeAsync(10);

      // Find the Get-SLLabel command
      const cmdWrite = initProc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('Get-SLLabel')
      )?.[0] as string;
      expect(cmdWrite).toContain('Get-SLLabel');
      expect(cmdWrite).toContain('-AsJson');

      completeCommand(initProc, 'Get-SLLabel', '[{"Name":"Confidential"}]');

      const result = await invokePromise;
      expect(result.success).toBe(true);
      expect(result.data).toEqual([{ Name: 'Confidential' }]);
      expect(bridge.isInitialized()).toBe(true);
    });

    it('builds structured command correctly', async () => {
      const invokePromise = bridge.invokeStructured('New-SLAutoLabelPolicy', {
        Name: 'Test Policy',
        Mode: 'Enable',
      });

      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      const cmdWrite = proc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('New-SLAutoLabelPolicy')
      )?.[0] as string;

      expect(cmdWrite).toContain("New-SLAutoLabelPolicy -Name 'Test Policy' -Mode 'Enable' -Confirm:$false");

      completeCommand(proc, 'New-SLAutoLabelPolicy', '{"Name":"Test Policy"}');
      const result = await invokePromise;
      expect(result.success).toBe(true);
    });

    it('escapes quotes in parameters', async () => {
      const invokePromise = bridge.invokeStructured('New-SLSnapshot', {
        Name: "it's a test",
        Scope: 'All',
      });

      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      const cmdWrite = proc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('New-SLSnapshot')
      )?.[0] as string;

      expect(cmdWrite).toContain("it''s a test");

      completeCommand(proc, 'New-SLSnapshot', '{}');
      await invokePromise;
    });

    it('rejects command injection via newlines', async () => {
      const result = await bridge.invokeStructured('Remove-SLSnapshot', {
        Name: "test\nInvoke-Expression 'malicious'",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('forbidden characters');
    });

    it('validates GUID parameters', async () => {
      const result = await bridge.invokeStructured('Invoke-SLAutoLabelScan', {
        LabelId: "'; evil code; '",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid GUID');
    });

    it('validates enum parameters', async () => {
      const result = await bridge.invokeStructured('New-SLAutoLabelPolicy', {
        Name: 'P1',
        Mode: 'InvalidMode',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('rejects path traversal', async () => {
      const result = await bridge.invokeStructured('Restore-SLSnapshot', {
        Name: 'test',
        Path: 'C:\\..\\Windows\\System32\\evil.xml',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('returns non-JSON output as string data', async () => {
      const invokePromise = bridge.invokeStructured('Get-SLLabel');

      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);
      completeCommand(proc, 'Get-SLLabel', 'not valid json');

      const result = await invokePromise;
      expect(result.success).toBe(true);
      expect(result.data).toBe('not valid json');
    });

    it('returns error when process is not available', async () => {
      // Mock spawn to return a process with null stdin
      const badProc = createMockProcess();
      (badProc as any).stdin = null;
      (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(badProc);

      const result = await bridge.invokeStructured('Get-SLLabel');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('uses win32 exe name for init process', async () => {
      (platform as ReturnType<typeof vi.fn>).mockReturnValue('win32');
      const winBridge = new PowerShellBridge('/path/to/StableLabel');
      winBridge.invokeStructured('Get-SLLabel');

      expect(spawn).toHaveBeenCalledWith(
        'pwsh.exe',
        expect.any(Array),
        expect.any(Object),
      );
      (platform as ReturnType<typeof vi.fn>).mockReturnValue('linux');
    });

    it('escapes single quotes in module path', async () => {
      const quoteBridge = new PowerShellBridge("/path/to/it's here/StableLabel");
      quoteBridge.invokeStructured('Get-SLLabel');

      const proc = lastProc();
      // Complete the AutoFlush init command so Import-Module gets queued
      const firstWrite = proc.stdin.write.mock.calls[0]?.[0] as string;
      const firstMarker = firstWrite?.match(/Write-Output '(___SL_DONE_[^']+)'/)?.[1];
      if (firstMarker) {
        proc.stdout.emit('data', Buffer.from(`ok\n${firstMarker}\n`));
      }
      await vi.advanceTimersByTimeAsync(10);

      // The Import-Module command is the second init call (after AutoFlush setup)
      const importWrite = proc.stdin.write.mock.calls.find((c: string[]) =>
        c[0]?.includes('Import-Module')
      )?.[0] as string;
      expect(importWrite).toContain("it''s here");
    });

    it('handles process close during operation', async () => {
      const invokePromise = bridge.invokeStructured('Get-SLLabel');
      const proc = lastProc();

      // Complete import
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      // Simulate process closing — bridge rejects immediately
      proc.emit('close', 1);

      const result = await invokePromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('exited unexpectedly');
    });

    it('logs stderr output', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      bridge.invokeStructured('Get-SLLabel');
      const proc = lastProc();
      proc.stderr.emit('data', Buffer.from('Warning: something'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PS_STDERR]'),
        'Warning: something',
      );
      consoleSpy.mockRestore();
    });

    it('logs when process exits', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      bridge.invokeStructured('Get-SLLabel');
      const proc = lastProc();
      proc.emit('close', 0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PS_BRIDGE]'),
        expect.stringContaining('exited with code 0'),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('device-code detection', () => {
    it('fires onDeviceCode for trusted Microsoft URLs', async () => {
      const callback = vi.fn();
      bridge.onDeviceCode = callback;

      bridge.invokeStructured('Connect-SLAll', { UseDeviceCode: true });
      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      proc.stdout.emit(
        'data',
        Buffer.from('To sign in, visit https://microsoft.com/devicelogin and enter the code ABC123456\n'),
      );

      expect(callback).toHaveBeenCalledWith({
        verificationUrl: 'https://microsoft.com/devicelogin',
        userCode: 'ABC123456',
        message: expect.stringContaining('microsoft.com/devicelogin'),
      });
    });

    it('does not re-fire callback for the same device code', async () => {
      const callback = vi.fn();
      bridge.onDeviceCode = callback;

      bridge.invokeStructured('Connect-SLAll', { UseDeviceCode: true });
      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      // First chunk with the device code
      proc.stdout.emit(
        'data',
        Buffer.from('To sign in, visit https://microsoft.com/devicelogin and enter the code ABC123456\n'),
      );
      expect(callback).toHaveBeenCalledTimes(1);

      // Second chunk arrives (buffer accumulates) — same code should NOT re-fire
      proc.stdout.emit(
        'data',
        Buffer.from('some more output\n'),
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('fires callback for a NEW device code after a previous one (Graph → Compliance)', async () => {
      const callback = vi.fn();
      bridge.onDeviceCode = callback;

      bridge.invokeStructured('Connect-SLAll', { UseDeviceCode: true });
      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      // First device code (Graph)
      proc.stdout.emit(
        'data',
        Buffer.from('To sign in, visit https://microsoft.com/devicelogin and enter the code GRAPH1234\n'),
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ userCode: 'GRAPH1234' }));

      // Second device code (Compliance) — buffer still has the first code
      proc.stdout.emit(
        'data',
        Buffer.from('To sign in, visit https://microsoft.com/devicelogin and enter the code COMPLY567\n'),
      );
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ userCode: 'COMPLY567' }));
    });

    it('rejects device-code from untrusted domains', async () => {
      const callback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      bridge.onDeviceCode = callback;

      bridge.invokeStructured('Connect-SLAll', { UseDeviceCode: true });
      const proc = lastProc();
      await completeInit(proc);
      await vi.advanceTimersByTimeAsync(10);

      proc.stdout.emit(
        'data',
        Buffer.from('To sign in, visit https://evil.com/devicelogin and enter the code ABC123456\n'),
      );

      expect(callback).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PS_BRIDGE]'),
        expect.stringContaining('Rejected untrusted'),
      );
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
      bridge.invokeStructured('Get-SLLabel');
      const proc = lastProc();

      // Complete initialization
      await completeInit(proc);
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
