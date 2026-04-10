import { SlashCommandBuilder, TextChannel, MessageFlags } from 'discord.js';
import { Command } from '../interfaces/Command';

export const CleanCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('clean')
        .setDescription('Deletes messages sent by the bot in this channel'),
    execute: async (interaction) => {
        const channel = interaction.channel as TextChannel;
        if (!channel) {
            await interaction.reply({ content: 'Diu, cannot access this channel!', flags: MessageFlags.Ephemeral });
            return;
        }

        const me = interaction.guild?.members.me;
        if (!me?.permissionsIn(channel).has('ManageMessages')) {
            await interaction.reply({ content: "I don't have permission to delete messages here.", flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const botId = interaction.client.user.id;
            let deleted = 0;
            let lastId: string | undefined;

            while (true) {
                const batch = await channel.messages.fetch({ limit: 100, before: lastId });
                if (batch.size === 0) break;

                const botMessages = batch.filter(msg => msg.author.id === botId);
                const recent = botMessages.filter(msg => msg.createdTimestamp > cutoff);
                const old = botMessages.filter(msg => msg.createdTimestamp <= cutoff);

                if (recent.size > 0) await channel.bulkDelete(recent);
                for (const msg of old.values()) await msg.delete();

                deleted += botMessages.size;
                lastId = batch.last()!.id;

                if (batch.size < 100) break;
            }

            if (deleted === 0) {
                await interaction.editReply('No messages to clean up!');
            } else {
                await interaction.editReply(`Cleaned up ${deleted} message${deleted === 1 ? '' : 's'}!`);
            }
        } catch (err) {
            await interaction.editReply('Failed to delete messages. Check my permissions.');
        }
    },
};
