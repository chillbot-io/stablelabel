/**
 * E2E security tests for the cmdlet registry.
 *
 * Verifies that the allowlist + parameter validation prevents injection
 * across all supported parameter types and edge cases.
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildCommand, escapePS, CMDLET_REGISTRY } from '../../cmdlet-registry';

describe('Cmdlet injection prevention (E2E security)', () => {
  it('escapes single quotes to prevent command chaining via semicolon', () => {
    const cmd = buildCommand('Get-SLLabelPolicy', { Identity: "test'; Remove-Item C:\\; '" });
    expect(cmd).toContain("''");
    expect(cmd).toBe("Get-SLLabelPolicy -Identity 'test''; Remove-Item C:\\; '''");
  });

  it('rejects newline injection in all string params', () => {
    const stringCmdlets = Object.entries(CMDLET_REGISTRY).filter(
      ([, def]) => def.params && Object.values(def.params).some(p => p.type === 'string'),
    );

    for (const [cmdlet, def] of stringCmdlets) {
      const stringParam = Object.entries(def.params!).find(([, p]) => p.type === 'string');
      if (!stringParam) continue;

      // Build all required params with valid values first
      const params: Record<string, unknown> = {};
      for (const [key, paramDef] of Object.entries(def.params!)) {
        if (paramDef.required && key !== stringParam[0]) {
          if (paramDef.type === 'guid') params[key] = '12345678-1234-1234-1234-123456789abc';
          else if (paramDef.type === 'number') params[key] = 1;
          else if (paramDef.type === 'string' || paramDef.type === 'path') params[key] = 'test-value';
          else if (paramDef.type === 'enum') params[key] = paramDef.allowedValues![0];
          else if (paramDef.type === 'items') params[key] = [{ DriveId: 'd1', ItemId: 'i1' }];
        }
      }
      params[stringParam[0]] = "value\nInvoke-Expression 'evil'";

      expect(
        () => buildCommand(cmdlet, params),
        `Cmdlet ${cmdlet} param ${stringParam[0]} should reject newlines`,
      ).toThrow('forbidden characters');
    }
  });

  it('rejects null byte injection in all string params', () => {
    const stringCmdlets = Object.entries(CMDLET_REGISTRY).filter(
      ([, def]) => def.params && Object.values(def.params).some(p => p.type === 'string'),
    );

    for (const [cmdlet, def] of stringCmdlets) {
      const stringParam = Object.entries(def.params!).find(([, p]) => p.type === 'string');
      if (!stringParam) continue;

      const params: Record<string, unknown> = {};
      for (const [key, paramDef] of Object.entries(def.params!)) {
        if (paramDef.required && key !== stringParam[0]) {
          if (paramDef.type === 'guid') params[key] = '12345678-1234-1234-1234-123456789abc';
          else if (paramDef.type === 'number') params[key] = 1;
          else if (paramDef.type === 'string' || paramDef.type === 'path') params[key] = 'test-value';
          else if (paramDef.type === 'enum') params[key] = paramDef.allowedValues![0];
          else if (paramDef.type === 'items') params[key] = [{ DriveId: 'd1', ItemId: 'i1' }];
        }
      }
      params[stringParam[0]] = "value\0evil";

      expect(
        () => buildCommand(cmdlet, params),
        `Cmdlet ${cmdlet} param ${stringParam[0]} should reject null bytes`,
      ).toThrow('forbidden characters');
    }
  });

  it('rejects non-allowlisted cmdlets', () => {
    const dangerousCmdlets = [
      'Invoke-Expression',
      'Start-Process',
      'Remove-Item',
      'Set-ExecutionPolicy',
      'New-PSSession',
      'Enter-PSSession',
      'Invoke-Command',
      'Get-Credential',
      'ConvertTo-SecureString',
    ];

    for (const cmdlet of dangerousCmdlets) {
      expect(
        () => buildCommand(cmdlet, {}),
        `Cmdlet ${cmdlet} should not be in allowlist`,
      ).toThrow('not in the allowlist');
    }
  });

  it('rejects unknown parameters for every registered cmdlet', () => {
    for (const [cmdlet, def] of Object.entries(CMDLET_REGISTRY)) {
      // Build required params first so we don't fail on missing required params
      const params: Record<string, unknown> = { InjectedParam: 'evil' };
      if (def.params) {
        for (const [key, paramDef] of Object.entries(def.params)) {
          if (paramDef.required) {
            if (paramDef.type === 'guid') params[key] = '12345678-1234-1234-1234-123456789abc';
            else if (paramDef.type === 'number') params[key] = 1;
            else if (paramDef.type === 'string' || paramDef.type === 'path') params[key] = 'test-value';
            else if (paramDef.type === 'enum') params[key] = paramDef.allowedValues![0];
            else if (paramDef.type === 'items') params[key] = [{ DriveId: 'd1', ItemId: 'i1' }];
          }
        }
      }

      expect(
        () => buildCommand(cmdlet, params),
        `Cmdlet ${cmdlet} should reject unknown param InjectedParam`,
      ).toThrow('Unknown parameter');
    }
  });

  it('enforces maxLength on string params', () => {
    const longName = 'A'.repeat(1025);
    expect(() => buildCommand('New-SLLabelPolicy', { Name: longName })).toThrow('maximum length');
  });

  it('rejects non-finite numbers in number params', () => {
    expect(() => buildCommand('Get-SLAuditLog', { Last: NaN })).toThrow('finite number');
    expect(() => buildCommand('Get-SLAuditLog', { Last: Infinity })).toThrow('finite number');
    expect(() => buildCommand('Get-SLAuditLog', { Last: -Infinity })).toThrow('finite number');
  });

  it('rejects invalid enum values', () => {
    expect(() =>
      buildCommand('New-SLAutoLabelPolicy', { Name: 'Test', Mode: "'; DROP TABLE policies; --" }),
    ).toThrow('must be one of');
  });

  it('escapes single quotes to prevent PowerShell string breakout', () => {
    const cmd = buildCommand('Get-SLLabelPolicy', { Identity: "O'Brien's Label" });
    expect(cmd).toContain("O''Brien''s Label");
    expect(cmd).toContain("-Identity 'O''Brien''s Label'");
  });

  it('every mutating cmdlet has confirm: true', () => {
    const mutatingPrefixes = ['New-', 'Set-', 'Remove-'];

    for (const [cmdlet, def] of Object.entries(CMDLET_REGISTRY)) {
      const isMutating = mutatingPrefixes.some(p => cmdlet.startsWith(p));
      if (isMutating) {
        expect(def.confirm, `Mutating cmdlet ${cmdlet} should have confirm: true`).toBe(true);
      }
    }
  });

  it('all Remove- cmdlets that delete top-level resources have guiConfirm: true', () => {
    const topLevelRemoves = [
      'Remove-SLLabelPolicy',
      'Remove-SLAutoLabelPolicy',
    ];

    for (const cmdlet of topLevelRemoves) {
      const def = CMDLET_REGISTRY[cmdlet];
      expect(def, `${cmdlet} should exist in registry`).toBeDefined();
      expect(def.guiConfirm, `${cmdlet} should require GUI confirmation`).toBe(true);
    }
  });
});

describe('escapePS edge cases', () => {
  it('handles empty string', () => {
    expect(escapePS('')).toBe('');
  });

  it('handles string with only single quotes', () => {
    expect(escapePS("'''")).toBe("''''''");
  });

  it('handles unicode characters', () => {
    expect(escapePS('日本語テスト')).toBe('日本語テスト');
  });

  it('handles backticks (PowerShell escape char)', () => {
    expect(escapePS('test`nvalue')).toBe('test`nvalue');
  });

  it('handles dollar signs (PowerShell variable prefix)', () => {
    expect(escapePS('$env:PATH')).toBe('$env:PATH');
  });

  it('rejects carriage return + newline', () => {
    expect(() => escapePS('line1\r\nline2')).toThrow('forbidden characters');
  });
});
