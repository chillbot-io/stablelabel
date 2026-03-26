/**
 * Local job runner — orchestrates bulk labeling entirely within the Electron app.
 *
 * No server, no database, no Redis. Uses:
 *   - PowerShell bridge for Graph API operations (enumerate sites, apply labels)
 *   - Classifier bridge for PII/PCI detection
 *   - Policy evaluator (pure TypeScript) for classification-to-label mapping
 *
 * Progress is reported via a callback; the renderer can display it directly.
 */

import { PowerShellBridge } from './powershell-bridge';
import { ClassifierBridge } from './classifier-bridge';
import { evaluatePolicies, PolicyRule, ClassificationResult, EntityMatch } from './policy-evaluator';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────

export interface JobConfig {
  /** Static label mode: apply this label to all files */
  target_label_id?: string;
  /** Policy mode: classify each file and pick label via policies */
  use_policies?: boolean;
  /** Evaluate and report without applying labels */
  dry_run?: boolean;
  /** Restrict to specific SharePoint site IDs */
  site_ids?: string[];
  /** Policies to evaluate (required when use_policies is true) */
  policies?: PolicyRule[];
}

export interface JobProgress {
  status: 'enumerating' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  phase: string;
  total_files: number;
  processed_files: number;
  labelled_files: number;
  skipped_files: number;
  failed_files: number;
  current_file?: string;
  current_site?: string;
  error?: string;
}

export interface FileResult {
  drive_id: string;
  item_id: string;
  filename: string;
  outcome: 'labelled' | 'skipped' | 'failed';
  label_applied?: string;
  classification?: string;
  confidence?: number;
  error?: string;
}

interface FileInfo {
  drive_id: string;
  item_id: string;
  name: string;
  site_id: string;
}

// ── Constants ────────────────────────────────────────────────

const BATCH_SIZE = 50;

// ── LocalJobRunner ───────────────────────────────────────────

export class LocalJobRunner {
  private ps: PowerShellBridge;
  private classifier: ClassifierBridge;
  private cancelled = false;
  private paused = false;
  private results: FileResult[] = [];

  constructor(ps: PowerShellBridge, classifier: ClassifierBridge) {
    this.ps = ps;
    this.classifier = classifier;
  }

  /** Request cancellation — takes effect between batches */
  cancel(): void {
    this.cancelled = true;
  }

  /** Request pause — takes effect between batches */
  pause(): void {
    this.paused = true;
  }

  /** Resume after pause */
  resume(): void {
    this.paused = false;
  }

  /** Get collected results so far */
  getResults(): FileResult[] {
    return [...this.results];
  }

  /**
   * Run a bulk labeling job end-to-end.
   *
   * @param config Job configuration (static label or policy-driven)
   * @param onProgress Called with progress updates (~every batch)
   * @returns Final results array
   */
  async run(
    config: JobConfig,
    onProgress: (progress: JobProgress) => void,
  ): Promise<FileResult[]> {
    this.cancelled = false;
    this.paused = false;
    this.results = [];

    const progress: JobProgress = {
      status: 'enumerating',
      phase: 'Enumerating SharePoint sites...',
      total_files: 0,
      processed_files: 0,
      labelled_files: 0,
      skipped_files: 0,
      failed_files: 0,
    };

    try {
      // ── Phase 1: Enumerate files ───────────────────────────
      onProgress({ ...progress });
      const files = await this.enumerate(config, progress, onProgress);

      if (this.cancelled) {
        progress.status = 'cancelled';
        onProgress({ ...progress });
        return this.results;
      }

      if (files.length === 0) {
        progress.status = 'completed';
        progress.phase = 'No files found';
        onProgress({ ...progress });
        return this.results;
      }

      progress.total_files = files.length;
      progress.status = 'running';
      progress.phase = config.dry_run ? 'Dry run — classifying files...' : 'Applying labels...';
      onProgress({ ...progress });

      // ── Phase 2: Label files ───────────────────────────────
      await this.labelFiles(files, config, progress, onProgress);

      if (this.cancelled) {
        progress.status = 'cancelled';
      } else {
        progress.status = 'completed';
        progress.phase = 'Done';
      }
      onProgress({ ...progress });

    } catch (err) {
      progress.status = 'failed';
      progress.error = err instanceof Error ? err.message : String(err);
      progress.phase = 'Failed';
      onProgress({ ...progress });
      logger.error('JOB', `Job failed: ${progress.error}`);
    }

    return this.results;
  }

  // ── Enumeration ──────────────────────────────────────────

  private async enumerate(
    config: JobConfig,
    progress: JobProgress,
    onProgress: (p: JobProgress) => void,
  ): Promise<FileInfo[]> {
    // Get all SharePoint sites
    const siteResult = await this.ps.invokeStructured('Get-SLSiteList', {});
    if (!siteResult.success || !Array.isArray(siteResult.data)) {
      throw new Error(`Failed to enumerate sites: ${siteResult.error}`);
    }

    let sites = siteResult.data as Array<{ Id: string; DisplayName: string }>;

    // Apply site filter if configured
    if (config.site_ids?.length) {
      const allowed = new Set(config.site_ids);
      sites = sites.filter((s) => allowed.has(s.Id));
    }

    const allFiles: FileInfo[] = [];

    for (const site of sites) {
      if (this.cancelled) break;
      while (this.paused) {
        progress.status = 'paused';
        onProgress({ ...progress });
        await sleep(1000);
      }
      progress.status = 'enumerating';

      progress.current_site = site.DisplayName || site.Id;
      progress.phase = `Enumerating: ${progress.current_site}`;
      onProgress({ ...progress });

      try {
        const childResult = await this.ps.invokeStructured('Get-SLDriveChildren', {
          SiteId: site.Id,
          Recurse: true,
        });

        if (childResult.success && Array.isArray(childResult.data)) {
          for (const item of childResult.data) {
            if (item.Type === 'file' && item.Id && item.Name) {
              allFiles.push({
                drive_id: item.DriveId || '',
                item_id: item.Id,
                name: item.Name,
                site_id: site.Id,
              });
            }
          }
        }
      } catch (err) {
        logger.warn('JOB', `Failed to enumerate site ${site.Id}: ${err}`);
      }

      progress.total_files = allFiles.length;
      onProgress({ ...progress });
    }

    logger.info('JOB', `Enumeration complete: ${allFiles.length} files across ${sites.length} sites`);
    return allFiles;
  }

  // ── Labelling ────────────────────────────────────────────

  private async labelFiles(
    files: FileInfo[],
    config: JobConfig,
    progress: JobProgress,
    onProgress: (p: JobProgress) => void,
  ): Promise<void> {
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      if (this.cancelled) return;
      while (this.paused) {
        progress.status = 'paused';
        onProgress({ ...progress });
        await sleep(1000);
      }
      progress.status = 'running';

      const batch = files.slice(i, i + BATCH_SIZE);

      for (const file of batch) {
        if (this.cancelled) return;

        progress.current_file = file.name;
        let labelId = config.target_label_id || '';
        let classification: ClassificationResult | null = null;

        // ── Policy mode: classify → evaluate ─────────────
        if (config.use_policies && config.policies?.length) {
          classification = await this.classifyFile(file);

          if (classification) {
            const match = evaluatePolicies(config.policies, classification, file.name);
            if (match) {
              labelId = match.target_label_id;
            } else {
              // No policy matched — skip
              progress.skipped_files++;
              progress.processed_files++;
              this.results.push({
                drive_id: file.drive_id,
                item_id: file.item_id,
                filename: file.name,
                outcome: 'skipped',
                classification: topEntity(classification),
              });
              onProgress({ ...progress });
              continue;
            }
          }
        }

        if (!labelId) {
          progress.skipped_files++;
          progress.processed_files++;
          this.results.push({
            drive_id: file.drive_id,
            item_id: file.item_id,
            filename: file.name,
            outcome: 'skipped',
          });
          onProgress({ ...progress });
          continue;
        }

        // ── Apply label (or dry-run) ─────────────────────
        if (config.dry_run) {
          progress.labelled_files++;
          progress.processed_files++;
          this.results.push({
            drive_id: file.drive_id,
            item_id: file.item_id,
            filename: file.name,
            outcome: 'labelled',
            label_applied: labelId,
            classification: topEntity(classification),
          });
        } else {
          try {
            const result = await this.ps.invokeStructured('Set-SLDocumentLabel', {
              DriveId: file.drive_id,
              ItemId: file.item_id,
              LabelId: labelId,
            });

            if (result.success) {
              progress.labelled_files++;
              this.results.push({
                drive_id: file.drive_id,
                item_id: file.item_id,
                filename: file.name,
                outcome: 'labelled',
                label_applied: labelId,
                classification: topEntity(classification),
              });
            } else {
              progress.failed_files++;
              this.results.push({
                drive_id: file.drive_id,
                item_id: file.item_id,
                filename: file.name,
                outcome: 'failed',
                error: result.error || 'Unknown error',
              });
            }
          } catch (err) {
            progress.failed_files++;
            this.results.push({
              drive_id: file.drive_id,
              item_id: file.item_id,
              filename: file.name,
              outcome: 'failed',
              error: err instanceof Error ? err.message : String(err),
            });
          }
          progress.processed_files++;
        }

        onProgress({ ...progress });
      }

      // Batch-level log
      logger.info(
        'JOB',
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
        `${progress.labelled_files} labelled, ${progress.skipped_files} skipped, ` +
        `${progress.failed_files} failed (${progress.processed_files}/${progress.total_files})`,
      );
    }
  }

  // ── Classification ───────────────────────────────────────

  private async classifyFile(file: FileInfo): Promise<ClassificationResult | null> {
    try {
      // Get file content text via PowerShell (downloads + extracts)
      const textResult = await this.ps.invokeStructured('Get-SLDocumentDetail', {
        DriveId: file.drive_id,
        ItemId: file.item_id,
        IncludeContent: true,
      });

      if (!textResult.success || !textResult.data) return null;

      const text = typeof textResult.data === 'string'
        ? textResult.data
        : (textResult.data as Record<string, unknown>).Content as string || '';

      if (!text || text.length < 10) return null;

      // Classify via classifier bridge
      const classResult = await this.classifier.invoke('analyze', { text, filename: file.name });

      if (!classResult.success || !classResult.data) return null;

      const data = classResult.data as Record<string, unknown>;
      const entities = (data.entities ?? []) as EntityMatch[];

      return {
        filename: file.name,
        entities,
        text_content: text,
      };
    } catch (err) {
      logger.warn('JOB', `Classification failed for ${file.name}: ${err}`);
      return null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function topEntity(classification: ClassificationResult | null): string | undefined {
  if (!classification?.entities?.length) return undefined;
  const best = classification.entities.reduce((a, b) => (a.confidence > b.confidence ? a : b));
  return best.entity_type;
}
