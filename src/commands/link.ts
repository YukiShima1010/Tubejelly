import type { ChatInputCommandInteraction } from 'discord.js';
import { getExtensionService } from '../extension/instance.js';

export const data = {
  name: 'link',
  description: 'Chrome拡張機能をアカウントに連携（拡張機能に表示された連携コードを入力）',
  dm_permission: true,
  options: [
    {
      name: 'code',
      type: 3,
      description: '連携コード（例: TJ-ABCD-2345）',
      required: true,
    },
  ],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const service = getExtensionService();
  if (!service) {
    await interaction.reply({
      content: '❌ Chrome拡張機能の連携は無効になっています。管理者に連絡してください。',
      ephemeral: true,
    });
    return;
  }

  const code = interaction.options.getString('code', true);
  const reply = await service.approvePairingCode(code, interaction.user.id, 'discord');
  await interaction.reply({ content: reply, ephemeral: true });
}
