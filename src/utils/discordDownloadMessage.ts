import { EmbedBuilder, type Message } from 'discord.js';
import { infoEmbed } from './discordEmbeds.js';

type EmbedPayload = { embeds: EmbedBuilder[] };
type SentEmbedMessage = { edit(payload: EmbedPayload): Promise<unknown> };
type DownloadProgressMessage = { edit(content: string): Promise<unknown> };
type SendEmbed = (payload: EmbedPayload) => Promise<SentEmbedMessage>;

export function createDiscordDownloadMessage(send: SendEmbed): Message {
  const channel = {
    send: async (content: string): Promise<DownloadProgressMessage> => {
      const message = await send({ embeds: [infoEmbed('ダウンロード', content)] });
      return {
        edit: async (updatedContent: string) =>
          message.edit({ embeds: [infoEmbed('ダウンロード', updatedContent)] }),
      };
    },
  };

  return { channel } as unknown as Message;
}