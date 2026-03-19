type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${tag}]`;
  switch (level) {
    case 'error':
      console.error(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    default:
      console.log(prefix, message, ...args);
  }
}

export const logger = {
  info: (tag: string, message: string, ...args: unknown[]) => log('info', tag, message, ...args),
  warn: (tag: string, message: string, ...args: unknown[]) => log('warn', tag, message, ...args),
  error: (tag: string, message: string, ...args: unknown[]) => log('error', tag, message, ...args),
};
