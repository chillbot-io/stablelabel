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

export interface RetentionLabel {
  Name: string;
  Guid: string;
  Comment: string | null;
  RetentionDuration: number | null;
  RetentionAction: string | null;
  RetentionType: string | null;
  IsRecordLabel: boolean;
  IsRegulatoryLabel: boolean;
  WhenCreated: string;
  WhenChanged: string | null;
}

export interface RetentionPolicy {
  Name: string;
  Guid: string;
  Comment: string | null;
  Enabled: boolean;
  Mode: string | null;
  WhenCreated: string;
  WhenChanged: string | null;
  ExchangeLocation: string[] | null;
  SharePointLocation: string[] | null;
  OneDriveLocation: string[] | null;
  ModernGroupLocation: string[] | null;
  SkypeLocation: string[] | null;
  PublicFolderLocation: string[] | null;
}

export interface DlpPolicy {
  Name: string;
  Guid: string;
  Comment: string | null;
  Mode: string | null;
  Enabled: boolean;
  WhenCreated: string;
  WhenChanged: string | null;
  ExchangeLocation: string[] | null;
  SharePointLocation: string[] | null;
  OneDriveLocation: string[] | null;
  TeamsLocation: string[] | null;
}

export interface DlpRule {
  Name: string;
  Guid: string;
  Policy: string;
  Comment: string | null;
  BlockAccess: boolean;
  NotifyUser: string[] | null;
  GenerateAlert: string[] | null;
  ContentContainsSensitiveInformation: unknown[] | null;
  Disabled: boolean;
  Priority: number | null;
}

export interface SensitiveInfoType {
  Name: string;
  Id: string;
  Description: string | null;
  Publisher: string | null;
  Type: string | null;
  RecommendedConfidence: number | null;
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

export interface ProtectionTemplate {
  TemplateId: string;
  Names: Record<string, string> | null;
  Descriptions: Record<string, string> | null;
  Status: string | null;
  ReadOnly: boolean;
}

export interface DocumentTrackEntry {
  ContentId: string | null;
  Issuer: string | null;
  Owner: string | null;
  ContentName: string | null;
  CreatedTime: string | null;
  FromTime: string | null;
  ToTime: string | null;
}

export interface ProtectionAdmin {
  EmailAddress: string;
  Role: string;
}

export interface ElevationStatus {
  StatePath: string;
  Exists: boolean;
  State: {
    ActiveJob: ElevatedJob | null;
    CompletedJobs: ElevatedJob[];
  } | null;
}

export interface ElevatedJob {
  JobId: string;
  UserPrincipalName: string;
  StartedAt: string;
  CompletedAt: string | null;
  Status: string;
  Elevations: Array<{
    Type: string;
    Target: string;
    Status: string;
    Timestamp: string;
  }>;
}

export interface SuperUserStatus {
  FeatureEnabled: boolean;
  SuperUsers: string[];
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

export interface PolicyHealth {
  Name: string;
  Type: string;
  Status: string;
  Mode: string;
  DistributionStatus: string;
  HasRules: boolean;
  LastModified: string;
  HealthStatus: string;
}

export interface FileShareConnection {
  Name: string;
  Path: string;
  DriveLetter: string;
  Server: string;
  ShareName: string;
  ConnectedAt: string;
  AuthType: string;
}

export interface FileShareDisconnectResult {
  Action: string;
  Disconnected: number;
  Failed: number;
  Results: Array<{
    Name: string;
    Path: string;
    Status: string;
    Error?: string;
  }>;
  Errors?: string[];
}

export interface FileShareInventory {
  Action: string;
  Summary: {
    TotalFiles: number;
    LabeledCount: number;
    UnlabeledCount: number;
    LabelDistribution: Record<string, number>;
  };
  Items: FileShareInventoryItem[];
  ExportPath: string | null;
}

export interface FileShareInventoryItem {
  FullPath: string;
  FileName: string;
  Extension: string;
  SizeKB: number;
  LastModified: string;
  IsSupported: boolean;
  IsLabeled: boolean;
  LabelName: string | null;
  LabelId: string | null;
  SubLabelName: string | null;
  SubLabelId: string | null;
  Owner: string | null;
}

export interface FileShareScanResult {
  Action: string;
  Path: string;
  TotalFiles: number;
  SupportedFiles: number;
  UnsupportedFiles: number;
  LabeledFiles: number;
  UnlabeledFiles: number;
  FilesByLabel: Record<string, number>;
  FilesByExtension: Record<string, number>;
  ScanDuration: string;
  Details: Array<{
    FullPath: string;
    FileName: string;
    Extension: string;
    SizeKB: number;
    IsLabeled: boolean;
    LabelName: string | null;
    SubLabelName: string | null;
    IsProtected: boolean;
    ScanStatus: string;
    Error: string | null;
  }>;
}

export interface FileShareBulkResult {
  Action: string;
  Path: string;
  TotalFiles: number;
  SuccessCount: number;
  FailedCount: number;
  SkippedCount: number;
  SensitivityLabelId: string;
  Results: Array<{
    Path: string;
    Status: string;
    Error: string | null;
  }>;
  DryRun: boolean;
}

export type Page =
  | 'dashboard'
  | 'labels'
  | 'retention'
  | 'dlp'
  | 'documents'
  | 'fileshares'
  | 'protection'
  | 'elevation'
  | 'snapshots'
  | 'analysis'
  | 'templates';
