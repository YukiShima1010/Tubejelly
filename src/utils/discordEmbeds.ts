import { EmbedBuilder } from 'discord.js';

const COLORS = {
  success: 0x2ecc71,
  info: 0x3498db,
  warning: 0xf1c40f,
  error: 0xe74c3c,
} as const;

export function discordEmbed(
  title: string,
  description: string,
  color: number = COLORS.info
): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
}

export function successEmbed(title: string, description: string): EmbedBuilder {
  return discordEmbed(`✅ ${title}`, description, COLORS.success);
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return discordEmbed(`ℹ️ ${title}`, description, COLORS.info);
}

export function warningEmbed(title: string, description: string): EmbedBuilder {
  return discordEmbed(`⚠️ ${title}`, description, COLORS.warning);
}

export function errorEmbed(description: string, title = 'エラー'): EmbedBuilder {
  return discordEmbed(`❌ ${title}`, description, COLORS.error);
}

export function skippedEmbed(title: string, description: string): EmbedBuilder {
  return discordEmbed(`⏭️ ${title}`, description, COLORS.warning);
}
