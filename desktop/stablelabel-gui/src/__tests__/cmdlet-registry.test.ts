// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildCommand, escapePS, CMDLET_REGISTRY } from '../cmdlet-registry';

describe('escapePS', () => {
  it('doubles single quotes', () => {
    expect(escapePS("it's here")).toBe("it''s here");
  });

  it('leaves normal strings unchanged', () => {
    expect(escapePS('hello world')).toBe('hello world');
  });

  it('rejects newlines', () => {
    expect(() => escapePS('line1\nline2')).toThrow('forbidden characters');
  });

  it('rejects carriage returns', () => {
    expect(() => escapePS('line1\rline2')).toThrow('forbidden characters');
  });

  it('rejects null bytes', () => {
    expect(() => escapePS('before\0after')).toThrow('forbidden characters');
  });
});

describe('buildCommand', () => {
  it('rejects unknown cmdlets', () => {
    expect(() => buildCommand('Invoke-Expression', {})).toThrow('not in the allowlist');
  });

  it('rejects arbitrary strings as cmdlets', () => {
    expect(() => buildCommand('rm -rf /', {})).toThrow('not in the allowlist');
  });

  it('builds a simple Get command with no params', () => {
    const cmd = buildCommand('Get-SLLabel', {});
    expect(cmd).toBe('Get-SLLabel');
  });

  it('builds a Get command with string param', () => {
    const cmd = buildCommand('Get-SLLabel', { Id: 'abc-123' });
    expect(cmd).toBe("Get-SLLabel -Id 'abc-123'");
  });

  it('builds a mutating command with auto -Confirm:$false', () => {
    const cmd = buildCommand('Remove-SLLabelPolicy', { Identity: 'MyPolicy' });
    expect(cmd).toBe("Remove-SLLabelPolicy -Identity 'MyPolicy' -Confirm:$false");
  });

  it('escapes single quotes in string params', () => {
    const cmd = buildCommand('Remove-SLSnapshot', { Name: "it's a test" });
    expect(cmd).toBe("Remove-SLSnapshot -Name 'it''s a test' -Confirm:$false");
  });

  it('rejects injection via newline in string param', () => {
    expect(() =>
      buildCommand('Remove-SLSnapshot', { Name: "test\nInvoke-Expression 'malicious'" }),
    ).toThrow('forbidden characters');
  });

  it('builds switch params', () => {
    const cmd = buildCommand('Set-SLDocumentLabel', { DriveId: 'd1', ItemId: 'i1', DryRun: true });
    expect(cmd).toContain('-DryRun');
  });

  it('omits switch params when falsy', () => {
    const cmd = buildCommand('Set-SLDocumentLabel', { DriveId: 'd1', ItemId: 'i1', DryRun: false });
    expect(cmd).not.toContain('-DryRun');
  });

  it('builds number params', () => {
    const cmd = buildCommand('Get-SLAuditLog', { Last: 10 });
    expect(cmd).toBe('Get-SLAuditLog -Last 10');
  });

  it('rejects non-finite numbers', () => {
    expect(() => buildCommand('Get-SLAuditLog', { Last: Infinity })).toThrow('finite number');
  });

  it('builds string array params', () => {
    const cmd = buildCommand('New-SLAutoLabelPolicy', {
      Name: 'Rule1',
      ExchangeLocation: ['user1@test.com', 'user2@test.com'],
    });
    expect(cmd).toContain("-ExchangeLocation 'user1@test.com','user2@test.com'");
  });

  it('validates enum params', () => {
    const cmd = buildCommand('New-SLAutoLabelPolicy', { Name: 'P1', Mode: 'Enable' });
    expect(cmd).toContain("-Mode 'Enable'");
  });

  it('rejects invalid enum values', () => {
    expect(() =>
      buildCommand('New-SLAutoLabelPolicy', { Name: 'P1', Mode: 'InvalidMode' }),
    ).toThrow('must be one of');
  });

  it('rejects unknown params', () => {
    expect(() =>
      buildCommand('Get-SLLabel', { UnknownParam: 'value' }),
    ).toThrow('Unknown parameter');
  });

  it('enforces required params', () => {
    expect(() => buildCommand('New-SLLabelPolicy', {})).toThrow('Required parameter');
  });

  it('skips empty/null/undefined values', () => {
    const cmd = buildCommand('New-SLLabelPolicy', {
      Name: 'Test',
      Comment: '',
    });
    expect(cmd).toBe("New-SLLabelPolicy -Name 'Test' -Confirm:$false");
  });

  it('builds items param (hashtable array)', () => {
    const cmd = buildCommand('Set-SLDocumentLabelBulk', {
      Items: [
        { DriveId: 'b!abc', ItemId: '01A' },
        { DriveId: 'b!def', ItemId: '02B' },
      ],
      LabelId: 'my-label',
    });
    expect(cmd).toContain("-Items @(@{DriveId='b!abc';ItemId='01A'},@{DriveId='b!def';ItemId='02B'})");
    expect(cmd).toContain("-LabelId 'my-label'");
  });
});

describe('CMDLET_REGISTRY', () => {
  it('contains expected cmdlets', () => {
    expect(CMDLET_REGISTRY['Get-SLLabel']).toBeDefined();
    expect(CMDLET_REGISTRY['Connect-SLAll']).toBeDefined();
    expect(CMDLET_REGISTRY['Get-SLLabelReport']).toBeDefined();
    expect(CMDLET_REGISTRY['Get-SLProtectionConfig']).toBeDefined();
  });

  it('does not contain removed cmdlets', () => {
    expect(CMDLET_REGISTRY['Get-SLDlpPolicy']).toBeUndefined();
    expect(CMDLET_REGISTRY['Get-SLRetentionLabel']).toBeUndefined();
    expect(CMDLET_REGISTRY['Enable-SLSuperUser']).toBeUndefined();
    expect(CMDLET_REGISTRY['Deploy-SLTemplate']).toBeUndefined();
    expect(CMDLET_REGISTRY['Connect-SLFileShare']).toBeUndefined();
  });

  it('does not contain dangerous cmdlets', () => {
    expect(CMDLET_REGISTRY['Invoke-Expression']).toBeUndefined();
    expect(CMDLET_REGISTRY['Start-Process']).toBeUndefined();
    expect(CMDLET_REGISTRY['Remove-Item']).toBeUndefined();
  });

  it('marks mutating commands with confirm', () => {
    expect(CMDLET_REGISTRY['Remove-SLLabelPolicy']?.confirm).toBe(true);
    expect(CMDLET_REGISTRY['New-SLSnapshot']?.confirm).toBe(true);
  });

  it('does not mark read commands with confirm', () => {
    expect(CMDLET_REGISTRY['Get-SLLabel']?.confirm).toBeFalsy();
    expect(CMDLET_REGISTRY['Get-SLConnectionStatus']?.confirm).toBeFalsy();
  });
});
