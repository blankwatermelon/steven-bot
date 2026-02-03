import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../interfaces/Command';
import { subscriptions } from '../music/Subscription';

export const LeaveCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('leave')
		.setDescription('Leaves the voice channel'),
	execute: async (interaction) => {
		if (!interaction.guildId) return;
        const subscription = subscriptions.get(interaction.guildId);

		if (subscription) {
			subscription.voiceConnection.destroy();
			subscriptions.delete(interaction.guildId);
			await interaction.reply('Steven out!');
		} else {
			await interaction.reply('Not playing in this server!');
		}
	},
};
