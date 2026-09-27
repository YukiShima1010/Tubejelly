import * as dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} が設定されていません。.env.example を確認してください。`);
  }
  return value;
}

function boolean(name: string, defaultValue: boolean): boolean {
  const value = (process.env[name] ?? String(defaultValue)).trim().toLowerCase();
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} は true または false で指定してください。`);
  }
  return value === 'true';
}

function port(name: string, defaultValue: number): number {
  const value = Number(process.env[name] ?? defaultValue);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} は1から65535までの整数で指定してください。`);
  }
  return value;
}

export const runtimeConfig = {
  discordEnabled: boolean('DISCORD_ENABLED', true),
  lineEnabled: boolean('LINE_ENABLED', false),
  discordToken: process.env.DISCORD_TOKEN?.trim() || undefined,
  lineChannelSecret: process.env.LINE_CHANNEL_SECRET?.trim() || undefined,
  lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || undefined,
  lineWebhookPort: port('LINE_WEBHOOK_PORT', 3330),
  usersConfigJson: required('USERS_CONFIG_JSON'),
};

if (runtimeConfig.discordEnabled && !runtimeConfig.discordToken) {
  throw new Error(
    'DISCORD_TOKEN が設定されていません。Discordを使わない場合は DISCORD_ENABLED=false にしてください。'
  );
}

if (
  runtimeConfig.lineEnabled &&
  (!runtimeConfig.lineChannelSecret || !runtimeConfig.lineChannelAccessToken)
) {
  throw new Error(
    'LINE_ENABLED=true の場合はLINE_CHANNEL_SECRETとLINE_CHANNEL_ACCESS_TOKENが必要です。'
  );
}
