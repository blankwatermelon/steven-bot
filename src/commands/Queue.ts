import { SlashCommandBuilder } from 'discord.js';
import { AudioPlayerStatus, AudioResource } from '@discordjs/voice';
import { Command } from '../interfaces/Command';
import { subscriptions } from '../music/Subscription';
import { Track } from '../music/Track';

export const QueueCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('queue')
		.setDescription('Show the current queue'),
	execute: async (interaction) => {
		if (!interaction.guildId) return;
        const subscription = subscriptions.get(interaction.guildId);

		if (subscription) {
            const current =
				subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
					? 'Nothing is currently singing!'
					: `currently singing: **${(subscription.audioPlayer.state.resource as AudioResource<Track>).metadata.title}**`;

			const queue = subscription.queue
				.slice(0, 5)
				.map((track, index) => `${index + 1}) ${track.title}`)
				.join('\n');

			await interaction.reply(`whats up next cousin?\n\n${queue}\n\n${current}`);
		} else {
			await interaction.reply('Not playing in this server!');
		}
	},
};
