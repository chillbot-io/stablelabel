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
  parentLabelId: string | null;
  contentFormats: string[] | null;
  autoLabeling: unknown | null;
}

/** Shape returned by Get-SLLabel -Tree */
export interface LabelTreeNode {
  Id: string;
  Name: string;
  Tooltip: string | null;
  IsActive: boolean;
  SubLabels: Array<{
    Id: string;
    Name: string;
    Tooltip: string | null;
    IsActive: boolean;
  }>;
}

export interface LabelPolicy {
  Name: string;
  Guid: string;
  Labels: string[];
  Comment: string | null;
  Enabled: boolean;
  CreatedBy: string;
  WhenCreated: string;
  WhenChanged: string | null;
  Mode: string | null;
  Type: string | null;
  ExchangeLocation: string[] | null;
  SharePointLocation: string[] | null;
  OneDriveLocation: string[] | null;
}

export interface AutoLabelPolicy {
  Name: string;
  Guid: string;
  Comment: string | null;
  Enabled: boolean;
  Mode: string | null;
  WhenCreated: string;
  WhenChanged: string | null;
  ApplySensitivityLabel: string | null;
  ExchangeLocation: string[] | null;
  SharePointLocation: string[] | null;
  OneDriveLocation: string[] | null;
  Priority: number | null;
}

export interface DocumentLabelResult {
  labels: Array<{
    sensitivityLabelId: string;
    name: string;
    description: string | null;
    color: string | null;
    assignmentMethod: string | null;
  }>;
}

export interface BulkLabelResult {
  Action: string;
  TotalItems: number;
  SuccessCount: number;
  FailedCount: number;
  SensitivityLabelId: string;
  DryRun: boolean;
  Results: Array<{
    DriveId: string;
    ItemId: string;
    Status: string;
    Error: string | null;
  }>;
}

export interface ProtectionConfig {
  BPOSId: string | null;
  RightsManagementServiceId: string | null;
  LicensingIntranetDistributionPointUrl: string | null;
  LicensingExtranetDistributionPointUrl: string | null;
  CertificationIntranetDistributionPointUrl: string | null;
  CertificationExtranetDistributionPointUrl: string | null;
  AdminConnectionUrl: string | null;
  AdminV2ConnectionUrl: string | null;
  OnPremiseDomainName: string | null;
  Keys: unknown[] | null;
  CurrentLicensorCertificateGuid: string | null;
  Templates: unknown[] | null;
  FunctionalState: string | null;
  SuperUsersEnabled: boolean;
  SuperUsers: string[] | null;
  AdminRoleMembers: string[] | null;
  KeyRolloverCount: number | null;
  ProvisioningDate: string | null;
  IPCv3ServiceFunctionalState: string | null;
  DevicePlatformState: Record<string, string> | null;
  FciEnabledForConnectorAuthorization: boolean;
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
    Modified: Array<{ Identity: string; PropertyChanges?: Array<{ Property: string; OldValue: string; NewValue: string }> }>;
    Summary: {
      AddedCount: number;
      RemovedCount: number;
      ModifiedCount: number;
      UnchangedCount: number;
    };
  }>;
}

export interface CsvImportResult {
  Action: string;
  TotalRows: number;
  ValidCount: number;
  InvalidCount: number;
  ValidRows: Array<{
    Row: number;
    DriveId: string;
    ItemId: string;
    LabelName: string | null;
    LabelId: string | null;
    Valid: boolean;
    Errors: string | null;
  }>;
  InvalidRows: Array<{
    Row: number;
    DriveId: string;
    ItemId: string;
    LabelName: string | null;
    LabelId: string | null;
    Valid: boolean;
    Errors: string | null;
  }>;
}

export interface BulkRemoveResult {
  Action: string;
  Mode: string;
  TotalItems: number;
  SuccessCount: number;
  FailedCount: number;
  DryRun: boolean;
  Results: Array<{
    DriveId: string;
    ItemId: string;
    Status: string;
    Error: string | null;
  }>;
}

export type Page =
  | 'dashboard'
  | 'labels'
  | 'documents'
  | 'manual-label'
  | 'bulk-ops'
  | 'explorer'
  | 'snapshots'
  | 'analysis'
  | 'classification'
  | 'settings';

/* ─── Data Classification (Presidio) ──────────────────────────────── */

/** Per-entity configuration for the classifier */
export interface EntityConfig {
  enabled: boolean;
  threshold: number;
}

/** Custom pattern recognizer definition */
export interface CustomRecognizer {
  name: string;
  entity_type: string;
  pattern: string;
  score: number;
  context_words: string[];
}

/** Full classifier configuration persisted in localStorage */
export interface ClassifierConfig {
  entities: Record<string, EntityConfig>;
  custom_recognizers: CustomRecognizer[];
  deny_lists: Record<string, string[]>;
}

/** A single PII detection result */
export interface ClassifierEntity {
  entity_type: string;
  start: number;
  end: number;
  score: number;
  text: string;
}

/** Response from the analyze action */
export interface ClassifierAnalyzeResult {
  results: ClassifierEntity[];
  entity_counts: Record<string, number>;
}
