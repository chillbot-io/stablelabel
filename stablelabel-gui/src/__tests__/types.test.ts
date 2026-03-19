import { describe, it, expect } from 'vitest';
import type {
  PsResult,
  ConnectionStatus,
  SensitivityLabel,
  LabelPolicy,
  DlpPolicy,
  RetentionLabel,
  SnapshotSummary,
  ElevatedJob,
  Page,
} from '../renderer/lib/types';

describe('TypeScript types', () => {
  it('PsResult shape is valid', () => {
    const success: PsResult<string> = { success: true, data: 'hello' };
    const failure: PsResult = { success: false, data: null, error: 'fail' };
    expect(success.success).toBe(true);
    expect(success.data).toBe('hello');
    expect(failure.error).toBe('fail');
    expect(failure.data).toBeNull();
  });

  it('ConnectionStatus shape is valid', () => {
    const status: ConnectionStatus = {
      GraphConnected: true,
      ComplianceConnected: false,
      ProtectionConnected: false,
      UserPrincipalName: 'user@example.com',
      TenantId: 'abc-123',
      GraphConnectedAt: '2024-01-01T00:00:00Z',
      ComplianceConnectedAt: null,
      ProtectionConnectedAt: null,
      ComplianceSessionAge: null,
      ProtectionAvailable: false,
    };
    expect(status.GraphConnected).toBe(true);
    expect(status.UserPrincipalName).toBe('user@example.com');
    // Verify all required fields are present
    const requiredKeys: Array<keyof ConnectionStatus> = [
      'GraphConnected', 'ComplianceConnected', 'ProtectionConnected',
      'UserPrincipalName', 'TenantId', 'GraphConnectedAt',
      'ComplianceConnectedAt', 'ProtectionConnectedAt',
      'ComplianceSessionAge', 'ProtectionAvailable',
    ];
    for (const key of requiredKeys) {
      expect(status).toHaveProperty(key);
    }
  });

  it('SensitivityLabel shape is valid', () => {
    const label: SensitivityLabel = {
      id: 'guid-1',
      name: 'Confidential',
      displayName: 'Confidential',
      description: null,
      tooltip: 'For internal use',
      isActive: true,
      priority: 1,
      color: '#ff0000',
      parent: null,
      parentLabelId: null,
      contentFormats: ['file', 'email'],
      autoLabeling: null,
    };
    expect(label.name).toBe('Confidential');
    expect(label.isActive).toBe(true);
    expect(Array.isArray(label.contentFormats)).toBe(true);
  });

  it('Page type contains all expected pages', () => {
    const pages: Page[] = [
      'dashboard', 'labels', 'retention', 'dlp', 'documents',
      'fileshares', 'protection', 'elevation', 'snapshots', 'analysis',
      'templates', 'settings',
    ];
    expect(pages).toHaveLength(12);
  });

  it('SnapshotSummary shape is valid', () => {
    const snapshot: SnapshotSummary = {
      Name: 'test-snapshot',
      SnapshotId: 'snap-1',
      Scope: 'All',
      CreatedAt: '2024-01-01T00:00:00Z',
      CreatedBy: 'user@example.com',
      TenantId: 'abc-123',
      Path: '/path/to/snapshot',
      SizeMB: 1.5,
      Items: { Labels: 10, Policies: 5 },
    };
    expect(snapshot.Name).toBe('test-snapshot');
    expect(snapshot.Items.Labels).toBe(10);
  });

  it('ElevatedJob shape is valid', () => {
    const job: ElevatedJob = {
      JobId: 'job-1',
      UserPrincipalName: 'admin@example.com',
      StartedAt: '2024-01-01T00:00:00Z',
      CompletedAt: null,
      Status: 'Active',
      Elevations: [
        { Type: 'SuperUser', Target: 'tenant', Status: 'Granted', Timestamp: '2024-01-01T00:00:00Z' },
      ],
    };
    expect(job.Status).toBe('Active');
    expect(job.Elevations).toHaveLength(1);
  });
});
