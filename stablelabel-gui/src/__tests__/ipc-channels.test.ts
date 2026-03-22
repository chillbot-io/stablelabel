import { describe, it, expect } from 'vitest';
import { IPC } from '../renderer/lib/ipc-channels';

describe('IPC channel constants', () => {
  it('defines PS_INVOKE channel', () => {
    expect(IPC.PS_INVOKE).toBe('ps:invoke');
  });

  it('defines PS_CHECK_PWSH channel', () => {
    expect(IPC.PS_CHECK_PWSH).toBe('ps:check-pwsh');
  });

  it('defines PS_GET_STATUS channel', () => {
    expect(IPC.PS_GET_STATUS).toBe('ps:get-status');
  });

  it('exports exactly the expected channel names', () => {
    expect(Object.keys(IPC).sort()).toEqual([
      'CLASSIFIER_CHECK',
      'CLASSIFIER_GET_STATUS',
      'CLASSIFIER_INVOKE',
      'PS_CHECK_PWSH',
      'PS_GET_STATUS',
      'PS_INVOKE',
    ]);
  });
});
