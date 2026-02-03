import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../interfaces/Command';
import { subscriptions } from '../music/Subscription';

export const SkipCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('skip')
		.setDescription('Skips the current song'),
	execute: async (interaction) => {
		if (!interaction.guildId) return;
        const subscription = subscriptions.get(interaction.guildId);

		if (subscription) {
			subscription.audioPlayer.stop();
			await interaction.reply('Skipped song!');
		} else {
			await interaction.reply('Not playing in this server!');
		}
	},
};
