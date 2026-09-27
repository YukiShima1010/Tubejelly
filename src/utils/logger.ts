import pino, { type Logger } from 'pino';

const logLevel = process.env.LOG_LEVEL ?? 'info';

type CompatibleLogger = Omit<Logger, 'error'> & {
  error(message: string, error?: unknown): void;
  error(object: object, message?: string): void;
};

export const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      'DISCORD_TOKEN',
      'LINE_CHANNEL_ACCESS_TOKEN',
      'LINE_CHANNEL_SECRET',
      'CLOUDFLARED_TUNNEL_TOKEN',
    ],
    censor: '[REDACTED]',
  },
}) as unknown as CompatibleLogger;
