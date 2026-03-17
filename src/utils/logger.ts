import { env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[env.LOG_LEVEL];
}

function serialize(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack ?? `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function format(level: LogLevel, message: string, ...args: unknown[]): string {
  const ts = new Date().toISOString();
  const extra = args.length ? ' ' + args.map(serialize).join(' ') : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${extra}`;
}

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.debug(format('debug', message, ...args));
  },
  info(message: string, ...args: unknown[]) {
    if (shouldLog('info')) console.info(format('info', message, ...args));
  },
  warn(message: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(format('warn', message, ...args));
  },
  error(message: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(format('error', message, ...args));
  },
};
