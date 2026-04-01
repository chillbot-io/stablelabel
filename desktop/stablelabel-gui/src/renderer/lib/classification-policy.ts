/**
 * Local classification policy — stored in encrypted preferences.
 * Maps SIT entity types to sensitivity labels with scope and schedule.
 */

export interface ClassificationPolicy {
  id: string;
  name: string;
  /** Is the policy active (will run on schedule and appear as runnable) */
  enabled: boolean;
  /** Entity types to detect (Presidio entity names) */
  entity_types: string[];
  /** Minimum confidence threshold (0.0–1.0) */
  min_confidence: number;
  /** Minimum entity count to trigger a match */
  min_count: number;
  /** Target sensitivity label ID */
  target_label_id: string;
  /** Target sensitivity label display name (for UI) */
  target_label_name: string;
  /** SharePoint site IDs to scan (empty = all sites) */
  site_ids: string[];
  /** Site display names (for UI, parallel to site_ids) */
  site_names: string[];
  /** File extension filter (empty = all) */
  extensions: string[];
  /** Skip files that already have a label */
  skip_already_labeled: boolean;
  /** Schedule — null means manual only */
  schedule: PolicySchedule | null;
  /** When this policy was created */
  created_at: string;
  /** When this policy was last modified */
  updated_at: string;
  /** When this policy last ran (null = never) */
  last_run_at: string | null;
  /** Result summary from last run */
  last_run_summary: RunSummary | null;
}

export interface PolicySchedule {
  /** Cron-like frequency */
  frequency: 'daily' | 'weekly' | 'monthly';
  /** Day of week (0=Sun, 1=Mon, ...) — for weekly */
  day_of_week?: number;
  /** Day of month (1–28) — for monthly */
  day_of_month?: number;
  /** Hour (0–23) */
  hour: number;
  /** Minute (0–59) */
  minute: number;
}

export interface RunSummary {
  total_files: number;
  classified: number;
  matched: number;
  labeled: number;
  failed: number;
  skipped: number;
  dry_run: boolean;
  duration_ms: number;
}

/** Generate a random policy ID */
export function newPolicyId(): string {
  return crypto.randomUUID?.() ?? `pol-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a blank policy with defaults */
export function createBlankPolicy(): ClassificationPolicy {
  return {
    id: newPolicyId(),
    name: '',
    enabled: true,
    entity_types: [],
    min_confidence: 0.7,
    min_count: 1,
    target_label_id: '',
    target_label_name: '',
    site_ids: [],
    site_names: [],
    extensions: [],
    skip_already_labeled: true,
    schedule: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_run_at: null,
    last_run_summary: null,
  };
}

/** Check if a schedule is due at the given time */
export function isScheduleDue(schedule: PolicySchedule, now: Date): boolean {
  if (now.getHours() !== schedule.hour || now.getMinutes() !== schedule.minute) return false;

  if (schedule.frequency === 'daily') return true;
  if (schedule.frequency === 'weekly') return now.getDay() === (schedule.day_of_week ?? 1);
  if (schedule.frequency === 'monthly') return now.getDate() === (schedule.day_of_month ?? 1);

  return false;
}

/** Human-readable schedule description */
export function describeSchedule(s: PolicySchedule | null): string {
  if (!s) return 'Manual only';
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (s.frequency === 'daily') return `Daily at ${time}`;
  if (s.frequency === 'weekly') return `Every ${days[s.day_of_week ?? 1]} at ${time}`;
  if (s.frequency === 'monthly') return `Monthly on the ${s.day_of_month ?? 1}${ordinal(s.day_of_month ?? 1)} at ${time}`;
  return 'Manual only';
}

function ordinal(n: number): string {
  if (n > 3 && n < 21) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/** All available Presidio entity types */
export const AVAILABLE_ENTITIES = [
  { id: 'CREDIT_CARD', label: 'Credit Card', category: 'Financial' },
  { id: 'IBAN_CODE', label: 'IBAN Code', category: 'Financial' },
  { id: 'US_BANK_NUMBER', label: 'US Bank Account', category: 'Financial' },
  { id: 'CRYPTO', label: 'Crypto Wallet', category: 'Financial' },
  { id: 'US_SSN', label: 'US Social Security Number', category: 'Government ID' },
  { id: 'US_PASSPORT', label: 'US Passport', category: 'Government ID' },
  { id: 'US_DRIVER_LICENSE', label: 'US Driver License', category: 'Government ID' },
  { id: 'US_ITIN', label: 'US ITIN', category: 'Government ID' },
  { id: 'UK_NHS', label: 'UK NHS Number', category: 'Government ID' },
  { id: 'UK_NINO', label: 'UK National Insurance', category: 'Government ID' },
  { id: 'EMAIL_ADDRESS', label: 'Email Address', category: 'Contact' },
  { id: 'PHONE_NUMBER', label: 'Phone Number', category: 'Contact' },
  { id: 'IP_ADDRESS', label: 'IP Address', category: 'Technical' },
  { id: 'URL', label: 'URL', category: 'Technical' },
  { id: 'PERSON', label: 'Person Name', category: 'Personal' },
  { id: 'LOCATION', label: 'Location', category: 'Personal' },
  { id: 'DATE_TIME', label: 'Date/Time', category: 'Personal' },
  { id: 'ORGANIZATION', label: 'Organization', category: 'Personal' },
  { id: 'NRP', label: 'Nationality/Religion/Politics', category: 'Sensitive' },
  { id: 'MEDICAL_LICENSE', label: 'Medical License', category: 'Healthcare' },
];
