/**
 * Cmdlet Registry — allowlist of permitted PowerShell commands with parameter schemas.
 *
 * The main process validates every IPC invocation against this registry before
 * forwarding to the PowerShell bridge.  Command strings are built server-side;
 * the renderer never constructs raw PowerShell.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParamType =
  | 'string'     // single-quoted, escaped
  | 'number'     // bare integer, validated finite
  | 'boolean'    // rendered as $true / $false
  | 'switch'     // present when truthy, absent when falsy
  | 'string[]'   // comma-separated single-quoted list
  | 'path'       // like string but rejects path traversal
  | 'guid'       // validated GUID format
  | 'enum'       // validated against allowedValues
  | 'items';     // special: hashtable array for bulk ops

export interface ParamDef {
  type: ParamType;
  required?: boolean;
  /** For 'enum' type only — the set of permitted values. */
  allowedValues?: string[];
}

export interface CmdletDef {
  /** Whether to auto-append -Confirm:$false */
  confirm?: boolean;
  /** Parameter definitions. Params not listed here are rejected. */
  params?: Record<string, ParamDef>;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DANGEROUS_CHARS = /[\r\n\0]/;

/** Escape a value for a PowerShell single-quoted string literal. */
export function escapePS(value: string): string {
  if (DANGEROUS_CHARS.test(value)) {
    throw new Error(`Parameter value contains forbidden characters (newline/null)`);
  }
  return value.replace(/'/g, "''");
}

/** Validate a path-type value: no traversal, no dangerous chars. */
function validatePath(value: string): void {
  if (DANGEROUS_CHARS.test(value)) {
    throw new Error('Path contains forbidden characters');
  }
  // Normalise separators for traversal check
  const normalised = value.replace(/\\/g, '/');
  if (normalised.includes('/../') || normalised.endsWith('/..') || normalised.startsWith('../')) {
    throw new Error('Path traversal detected');
  }
}

// ---------------------------------------------------------------------------
// Command builder
// ---------------------------------------------------------------------------

export function buildCommand(
  cmdlet: string,
  params: Record<string, unknown> = {},
): string {
  const def = CMDLET_REGISTRY[cmdlet];
  if (!def) {
    throw new Error(`Cmdlet "${cmdlet}" is not in the allowlist`);
  }

  const parts: string[] = [cmdlet];
  const schema = def.params ?? {};

  // Check for unknown params
  for (const key of Object.keys(params)) {
    if (!(key in schema)) {
      throw new Error(`Unknown parameter "-${key}" for ${cmdlet}`);
    }
  }

  // Check required params
  for (const [key, paramDef] of Object.entries(schema)) {
    if (paramDef.required && (params[key] === undefined || params[key] === null || params[key] === '')) {
      throw new Error(`Required parameter "-${key}" missing for ${cmdlet}`);
    }
  }

  // Build each param
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;

    const paramDef = schema[key];
    if (!paramDef) continue; // already validated above

    switch (paramDef.type) {
      case 'string': {
        const s = String(value);
        parts.push(`-${key} '${escapePS(s)}'`);
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error(`Parameter "-${key}" must be a finite number`);
        parts.push(`-${key} ${Math.round(n)}`);
        break;
      }
      case 'boolean': {
        parts.push(`-${key} $${value ? 'true' : 'false'}`);
        break;
      }
      case 'switch': {
        if (value) parts.push(`-${key}`);
        break;
      }
      case 'string[]': {
        if (!Array.isArray(value) || value.length === 0) break;
        const items = value.map((v: unknown) => `'${escapePS(String(v))}'`);
        parts.push(`-${key} ${items.join(',')}`);
        break;
      }
      case 'path': {
        const s = String(value);
        validatePath(s);
        parts.push(`-${key} '${escapePS(s)}'`);
        break;
      }
      case 'guid': {
        const s = String(value);
        if (!GUID_RE.test(s)) throw new Error(`Parameter "-${key}" must be a valid GUID`);
        parts.push(`-${key} '${s}'`);
        break;
      }
      case 'enum': {
        const s = String(value);
        if (!paramDef.allowedValues?.includes(s)) {
          throw new Error(`Parameter "-${key}" must be one of: ${paramDef.allowedValues?.join(', ')}`);
        }
        parts.push(`-${key} '${s}'`);
        break;
      }
      case 'items': {
        // Special: array of {DriveId, ItemId} → PowerShell hashtable array
        if (!Array.isArray(value)) throw new Error(`Parameter "-${key}" must be an array`);
        const entries = value.map((item: unknown) => {
          const obj = item as Record<string, string>;
          if (!obj.DriveId || !obj.ItemId) throw new Error('Each item must have DriveId and ItemId');
          return `@{DriveId='${escapePS(obj.DriveId)}';ItemId='${escapePS(obj.ItemId)}'}`;
        });
        parts.push(`-${key} @(${entries.join(',')})`);
        break;
      }
    }
  }

  if (def.confirm) {
    parts.push('-Confirm:$false');
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const CMDLET_REGISTRY: Record<string, CmdletDef> = {
  // ── Connection ────────────────────────────────────────────────────────
  'Connect-SLAll': {
    params: {
      UseDeviceCode: { type: 'switch' },
    },
  },
  'Get-SLConnectionStatus': {},

  // ── Labels ────────────────────────────────────────────────────────────
  'Get-SLLabel': {
    params: {
      Id: { type: 'string' },
      Tree: { type: 'switch' },
    },
  },

  // ── Label Policies ────────────────────────────────────────────────────
  'Get-SLLabelPolicy': {
    params: {
      Identity: { type: 'string' },
    },
  },
  'New-SLLabelPolicy': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      Labels: { type: 'string[]' },
      Comment: { type: 'string' },
    },
  },
  'Set-SLLabelPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      Labels: { type: 'string[]' },
      Comment: { type: 'string' },
    },
  },
  'Remove-SLLabelPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
    },
  },

  // ── Auto-Label Policies ───────────────────────────────────────────────
  'Get-SLAutoLabelPolicy': {
    params: {
      Identity: { type: 'string' },
    },
  },
  'New-SLAutoLabelPolicy': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      ApplySensitivityLabel: { type: 'string' },
      Mode: { type: 'enum', allowedValues: ['Enable', 'Disable', 'TestWithNotifications', 'TestWithoutNotifications'] },
      ExchangeLocation: { type: 'string[]' },
      SharePointLocation: { type: 'string[]' },
      OneDriveLocation: { type: 'string[]' },
    },
  },
  'Set-SLAutoLabelPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      Mode: { type: 'enum', allowedValues: ['Enable', 'Disable', 'TestWithNotifications', 'TestWithoutNotifications'] },
    },
  },
  'Remove-SLAutoLabelPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
    },
  },

  // ── DLP Policies ──────────────────────────────────────────────────────
  'Get-SLDlpPolicy': {
    params: {
      Identity: { type: 'string' },
    },
  },
  'New-SLDlpPolicy': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      Comment: { type: 'string' },
      Mode: { type: 'enum', allowedValues: ['Enable', 'Disable', 'TestWithNotifications', 'TestWithoutNotifications'] },
      ExchangeLocation: { type: 'string[]' },
      SharePointLocation: { type: 'string[]' },
      OneDriveLocation: { type: 'string[]' },
      TeamsLocation: { type: 'string[]' },
    },
  },
  'Set-SLDlpPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      Comment: { type: 'string' },
      Mode: { type: 'enum', allowedValues: ['Enable', 'Disable', 'TestWithNotifications', 'TestWithoutNotifications'] },
    },
  },
  'Remove-SLDlpPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
    },
  },

  // ── DLP Rules ─────────────────────────────────────────────────────────
  'Get-SLDlpRule': {
    params: {
      Identity: { type: 'string' },
    },
  },
  'New-SLDlpRule': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      Policy: { type: 'string', required: true },
      Comment: { type: 'string' },
      BlockAccess: { type: 'boolean' },
      NotifyUser: { type: 'string[]' },
      GenerateAlert: { type: 'string[]' },
    },
  },
  'Set-SLDlpRule': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      Comment: { type: 'string' },
      BlockAccess: { type: 'boolean' },
    },
  },
  'Remove-SLDlpRule': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
    },
  },

  // ── Sensitive Info Types ──────────────────────────────────────────────
  'Get-SLSensitiveInfoType': {
    params: {
      Identity: { type: 'string' },
    },
  },

  // ── Retention Policies ────────────────────────────────────────────────
  'Get-SLRetentionPolicy': {
    params: {
      Identity: { type: 'string' },
    },
  },
  'New-SLRetentionPolicy': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      Comment: { type: 'string' },
      Enabled: { type: 'boolean' },
      ExchangeLocation: { type: 'string[]' },
      SharePointLocation: { type: 'string[]' },
      OneDriveLocation: { type: 'string[]' },
      ModernGroupLocation: { type: 'string[]' },
    },
  },
  'Set-SLRetentionPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      Comment: { type: 'string' },
      Enabled: { type: 'boolean' },
    },
  },
  'Remove-SLRetentionPolicy': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
    },
  },

  // ── Retention Labels ──────────────────────────────────────────────────
  'Get-SLRetentionLabel': {
    params: {
      Identity: { type: 'string' },
    },
  },
  'New-SLRetentionLabel': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      Comment: { type: 'string' },
      RetentionDuration: { type: 'number' },
      RetentionAction: { type: 'enum', allowedValues: ['Keep', 'Delete', 'KeepAndDelete'] },
      RetentionType: { type: 'enum', allowedValues: ['CreationAgeInDays', 'ModificationAgeInDays', 'TaggedAgeInDays'] },
    },
  },
  'Set-SLRetentionLabel': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      Comment: { type: 'string' },
      RetentionDuration: { type: 'number' },
    },
  },
  'Remove-SLRetentionLabel': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
    },
  },

  // ── Documents ─────────────────────────────────────────────────────────
  'Get-SLDocumentLabel': {
    params: {
      DriveId: { type: 'string', required: true },
      ItemId: { type: 'string', required: true },
    },
  },
  'Set-SLDocumentLabel': {
    confirm: true,
    params: {
      DriveId: { type: 'string', required: true },
      ItemId: { type: 'string', required: true },
      LabelId: { type: 'string' },
      LabelName: { type: 'string' },
      Justification: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },
  'Set-SLDocumentLabelBulk': {
    confirm: true,
    params: {
      Items: { type: 'items', required: true },
      LabelId: { type: 'string' },
      LabelName: { type: 'string' },
      Justification: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },
  'Remove-SLDocumentLabel': {
    confirm: true,
    params: {
      DriveId: { type: 'string', required: true },
      ItemId: { type: 'string', required: true },
      Justification: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },

  // ── File Shares ───────────────────────────────────────────────────────
  'Connect-SLFileShare': {
    params: {
      Path: { type: 'path', required: true },
      DriveLetter: { type: 'string' },
      Name: { type: 'string' },
    },
  },
  'Disconnect-SLFileShare': {
    params: {
      Path: { type: 'string' },
      All: { type: 'switch' },
    },
  },
  'Get-SLFileShareLabel': {
    params: {
      Path: { type: 'string', required: true },
    },
  },
  'Get-SLFileShareScan': {
    params: {
      Path: { type: 'path', required: true },
      Filter: { type: 'string' },
      Recurse: { type: 'switch' },
      ReportOnly: { type: 'switch' },
    },
  },
  'Get-SLFileShareInventory': {
    params: {
      Path: { type: 'path', required: true },
      Recurse: { type: 'switch' },
      ExportPath: { type: 'path' },
    },
  },
  'Set-SLFileShareLabel': {
    confirm: true,
    params: {
      Path: { type: 'path', required: true },
      LabelId: { type: 'string' },
      LabelName: { type: 'string' },
      Justification: { type: 'string' },
      Owner: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },
  'Set-SLFileShareLabelBulk': {
    confirm: true,
    params: {
      Path: { type: 'path', required: true },
      LabelId: { type: 'string' },
      LabelName: { type: 'string' },
      Justification: { type: 'string' },
      Filter: { type: 'string' },
      Recurse: { type: 'switch' },
      DryRun: { type: 'switch' },
    },
  },
  'Remove-SLFileShareLabel': {
    confirm: true,
    params: {
      Path: { type: 'path', required: true },
      Justification: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },

  // ── Protection / AIP ──────────────────────────────────────────────────
  'Get-SLProtectionConfig': {},
  'Get-SLProtectionTemplate': {},
  'Get-SLProtectionAdmin': {},
  'Get-SLProtectionKey': {},
  'Get-SLProtectionLog': {
    params: {
      UserEmail: { type: 'string' },
      FromTime: { type: 'string' },
      ToTime: { type: 'string' },
    },
  },
  'Get-SLOnboardingPolicy': {},
  'Set-SLOnboardingPolicy': {
    confirm: true,
    params: {
      UseRmsUserLicense: { type: 'boolean' },
      Scope: { type: 'enum', allowedValues: ['All', 'Department'] },
      SecurityGroupObjectId: { type: 'string' },
    },
  },
  'Remove-SLProtectionTemplate': {
    confirm: true,
    params: {
      TemplateId: { type: 'guid', required: true },
    },
  },
  'Export-SLProtectionTemplate': {
    confirm: true,
    params: {
      TemplateId: { type: 'guid', required: true },
      Path: { type: 'path', required: true },
    },
  },
  'Import-SLProtectionTemplate': {
    confirm: true,
    params: {
      Path: { type: 'path', required: true },
    },
  },
  'Get-SLDocumentTrack': {
    params: {
      UserEmail: { type: 'string' },
      FromTime: { type: 'string' },
      ToTime: { type: 'string' },
    },
  },
  'Revoke-SLDocumentAccess': {
    confirm: true,
    params: {
      ContentId: { type: 'string', required: true },
      IssuerEmail: { type: 'string', required: true },
    },
  },
  'Restore-SLDocumentAccess': {
    confirm: true,
    params: {
      ContentId: { type: 'string', required: true },
      IssuerEmail: { type: 'string', required: true },
    },
  },

  // ── Elevation ─────────────────────────────────────────────────────────
  'Get-SLElevationStatus': {},
  'Get-SLSuperUserStatus': {},
  'Enable-SLSuperUser': {
    confirm: true,
    params: {
      DryRun: { type: 'switch' },
    },
  },
  'Disable-SLSuperUser': {
    confirm: true,
    params: {
      UserPrincipalName: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },
  'Grant-SLSiteAdmin': {
    confirm: true,
    params: {
      SiteUrl: { type: 'string', required: true },
      UserPrincipalName: { type: 'string', required: true },
      Role: { type: 'string' },
      DryRun: { type: 'switch' },
    },
  },
  'Revoke-SLSiteAdmin': {
    confirm: true,
    params: {
      SiteUrl: { type: 'string', required: true },
      UserPrincipalName: { type: 'string', required: true },
      DryRun: { type: 'switch' },
    },
  },
  'Grant-SLMailboxAccess': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      User: { type: 'string', required: true },
      AccessRights: { type: 'enum', allowedValues: ['FullAccess', 'ReadPermission', 'ChangePermission'] },
      DryRun: { type: 'switch' },
    },
  },
  'Revoke-SLMailboxAccess': {
    confirm: true,
    params: {
      Identity: { type: 'string', required: true },
      User: { type: 'string', required: true },
      AccessRights: { type: 'enum', allowedValues: ['FullAccess', 'ReadPermission', 'ChangePermission'] },
      DryRun: { type: 'switch' },
    },
  },
  'Start-SLElevatedJob': {
    confirm: true,
    params: {
      UserPrincipalName: { type: 'string', required: true },
      TenantId: { type: 'string' },
      SiteUrls: { type: 'string[]' },
      FileSharePaths: { type: 'string[]' },
      SkipSuperUser: { type: 'switch' },
      SkipSiteAdmin: { type: 'switch' },
      DryRun: { type: 'switch' },
    },
  },
  'Stop-SLElevatedJob': {
    params: {
      JobId: { type: 'string' },
      Force: { type: 'switch' },
      ReconnectOriginal: { type: 'switch' },
    },
  },
  'Request-SLPimRole': {
    confirm: true,
    params: {
      RoleDefinitionId: { type: 'string', required: true },
      Justification: { type: 'string', required: true },
      DurationHours: { type: 'number', required: true },
      DryRun: { type: 'switch' },
    },
  },

  // ── Snapshots ─────────────────────────────────────────────────────────
  'Get-SLSnapshot': {},
  'New-SLSnapshot': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      Scope: { type: 'enum', allowedValues: ['All', 'Labels', 'DLP', 'Retention', 'AutoLabel'] },
    },
  },
  'Remove-SLSnapshot': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
    },
  },
  'Compare-SLSnapshot': {
    params: {
      Name: { type: 'string', required: true },
      Live: { type: 'switch' },
    },
  },

  // ── Analysis ──────────────────────────────────────────────────────────
  'Get-SLAuditLog': {
    params: {
      Last: { type: 'number' },
    },
  },
  'Get-SLPolicyHealth': {
    params: {
      PolicyType: { type: 'enum', allowedValues: ['All', 'DLP', 'Retention', 'AutoLabel', 'Label'] },
    },
  },
  'Get-SLLabelReport': {},
  'Get-SLLabelMismatch': {},
  'Test-SLPolicyConflict': {
    params: {
      PolicyType: { type: 'enum', allowedValues: ['All', 'DLP', 'Retention', 'AutoLabel', 'Label'] },
    },
  },
  'Test-SLPermission': {
    params: {
      Scope: { type: 'enum', allowedValues: ['All', 'Graph', 'Compliance', 'Protection'] },
    },
  },

  // ── Templates ─────────────────────────────────────────────────────────
  'Get-SLTemplate': {},
  'Deploy-SLTemplate': {
    confirm: true,
    params: {
      Name: { type: 'string', required: true },
      DryRun: { type: 'switch' },
    },
  },
};
