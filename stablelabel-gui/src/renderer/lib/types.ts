/** TypeScript types matching PowerShell output shapes */

export interface PsResult<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ConnectionStatus {
  GraphConnected: boolean;
  ComplianceConnected: boolean;
  ProtectionConnected: boolean;
  UserPrincipalName: string | null;
  TenantId: string | null;
  GraphConnectedAt: string | null;
  ComplianceConnectedAt: string | null;
  ProtectionConnectedAt: string | null;
  ComplianceSessionAge: string | null;
  ProtectionAvailable: boolean;
}

export interface SensitivityLabel {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  tooltip: string | null;
  isActive: boolean;
  priority: number;
  color: string | null;
  parent: { id: string } | null;
}

export interface LabelPolicy {
  Name: string;
  Guid: string;
  Labels: string[];
  Comment: string | null;
  Enabled: boolean;
  CreatedBy: string;
  WhenCreated: string;
}

export interface SnapshotSummary {
  Name: string;
  SnapshotId: string;
  Scope: string;
  CreatedAt: string;
  CreatedBy: string;
  TenantId: string;
  Path: string;
  SizeMB: number;
  Items: Record<string, number>;
}

export interface SnapshotDiff {
  ReferenceSnapshot: string;
  ComparisonSource: string;
  ComparedAt: string;
  HasChanges: boolean;
  Categories: Record<string, {
    Added: Array<{ Identity: string }>;
    Removed: Array<{ Identity: string }>;
    Modified: Array<{ Identity: string }>;
    Summary: {
      AddedCount: number;
      RemovedCount: number;
      ModifiedCount: number;
      UnchangedCount: number;
    };
  }>;
}

export interface PolicyHealth {
  Name: string;
  Type: string;
  Status: string;
  Mode: string;
  DistributionStatus: string;
  HasRules: boolean;
  LastModified: string;
}

export type Page =
  | 'dashboard'
  | 'labels'
  | 'retention'
  | 'dlp'
  | 'documents'
  | 'protection'
  | 'elevation'
  | 'snapshots'
  | 'analysis'
  | 'templates';
