import pino from 'pino';
import { redactObject } from './redact';
import { config } from './config';

export const logger = pino({
  level: config.LOG_LEVEL || 'info',
  formatters: {
    log(object) {
      return redactObject(object);
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createScopedLogger(moduleName: string, context?: Record<string, unknown>) {
  return logger.child({ module: moduleName, ...context });
}
