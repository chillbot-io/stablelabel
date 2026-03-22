/** Shared TypeScript types for the StableLabel SPA. */

// ── Auth ────────────────────────────────────────────────────

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: 'Admin' | 'Operator' | 'Viewer';
  mspTenantId: string;
  entraTenantId: string;
}

// ── Tenants ─────────────────────────────────────────────────

export interface CustomerTenant {
  id: string;
  entra_tenant_id: string;
  display_name: string;
  consent_status: 'pending' | 'active' | 'revoked';
  consented_at: string | null;
  created_at: string;
  user_count: number;
}

// ── Users ───────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  email: string;
  display_name: string;
  role: string;
  first_seen: string;
  last_seen: string;
  tenant_count: number;
}

export interface TenantAccess {
  customer_tenant_id: string;
  display_name: string;
  entra_tenant_id: string;
  granted_at: string;
  granted_by: string;
}

// ── Jobs ────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'
  | 'enumerating'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  config: Record<string, unknown>;
  total_files: number;
  processed_files: number;
  failed_files: number;
  skipped_files: number;
  schedule_cron: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobListPage {
  items: Job[];
  total: number;
  page: number;
  page_size: number;
}

// ── Policies ────────────────────────────────────────────────

export interface Policy {
  id: string;
  name: string;
  is_builtin: boolean;
  is_enabled: boolean;
  rules: Record<string, unknown>;
  target_label_id: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

// ── Audit ───────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  event_type: string;
  actor_email: string | null;
  customer_tenant_id: string | null;
  job_id: string | null;
  target_file: string | null;
  target_site: string | null;
  label_applied: string | null;
  previous_label: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditPage {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
}

// ── Labels ──────────────────────────────────────────────────

export interface SensitivityLabel {
  id: string;
  name: string;
  display_name: string;
  description: string;
  priority: number;
  color: string;
  is_active: boolean;
  has_protection: boolean;
  applicable_to: string[];
  parent_id: string | null;
  is_parent: boolean;
}
