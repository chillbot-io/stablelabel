type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = 'info';

function log(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${tag}]`;
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
