type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MAX_LOG_FILES = 10;
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file

let currentLevel: LogLevel = 'info';

// File logging state — only populated in main process via initFileLogging()
let logDir: string | null = null;
let logFilePath: string | null = null;
let fsModule: typeof import('node:fs') | null = null;
let pathModule: typeof import('node:path') | null = null;

/** Initialize file logging. Call once from main.ts after app is ready. */
export async function initFileLogging(userDataPath: string): Promise<void> {
  try {
    // Dynamic import — only works in main process (Node.js), not in renderer
    const fs = await import('node:fs');
    const p = await import('node:path');
    fsModule = fs;
    pathModule = p;

    logDir = p.join(userDataPath, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    logFilePath = p.join(logDir, `stablelabel-${ts}.log`);
    fs.writeFileSync(logFilePath, `StableLabel log started at ${new Date().toISOString()}\n`);

    // Rotate: keep only the newest MAX_LOG_FILES files
    try {
      const files = fs.readdirSync(logDir)
        .filter((f) => f.startsWith('stablelabel-') && f.endsWith('.log'))
        .map((f) => ({ name: f, mtime: fs.statSync(p.join(logDir!, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      for (const file of files.slice(MAX_LOG_FILES)) {
        try { fs.unlinkSync(p.join(logDir!, file.name)); } catch { /* file may already be deleted or locked */ }
      }
    } catch {
      // Rotation failed — not critical
    }
  } catch {
    // Dynamic import of node:fs failed — we're in the renderer, no file logging
  }
}

function writeToFile(line: string): void {
  if (!logFilePath || !fsModule || !logDir || !pathModule) return;
  try {
    // Rotate if current file exceeds max size
    try {
      const stats = fsModule.statSync(logFilePath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        logFilePath = pathModule.join(logDir, `stablelabel-${ts}.log`);
        fsModule.writeFileSync(logFilePath, `StableLabel log rotated at ${new Date().toISOString()}\n`);
      }
    } catch {
      // stat failed — file may not exist yet
    }
    fsModule.appendFileSync(logFilePath, line + '\n');
  } catch {
    // File write failed — don't crash the app
  }
}

function log(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${tag}]`;
  const extra = args.length > 0 ? ' ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') : '';
  const line = `${prefix} ${message}${extra}`;

  switch (level) {
    case 'error':
      console.error(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    case 'debug':
      console.debug(prefix, message, ...args);
      break;
    default:
      console.log(prefix, message, ...args);
  }

  writeToFile(line);
}

export const logger = {
  debug: (tag: string, message: string, ...args: unknown[]) => log('debug', tag, message, ...args),
  info: (tag: string, message: string, ...args: unknown[]) => log('info', tag, message, ...args),
  warn: (tag: string, message: string, ...args: unknown[]) => log('warn', tag, message, ...args),
  error: (tag: string, message: string, ...args: unknown[]) => log('error', tag, message, ...args),
  setLevel: (level: string) => {
    const normalized = level.toLowerCase() as LogLevel;
    if (normalized in LEVEL_PRIORITY) currentLevel = normalized;
  },
};
