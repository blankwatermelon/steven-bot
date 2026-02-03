import { SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { Command } from '../interfaces/Command';
import { MusicSubscription, subscriptions } from '../music/Subscription';
import { Track, TrackFactory } from '../music/Track';

export const PlayCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Plays a song from YouTube')
		.addStringOption(option => 
            option.setName('song')
                .setDescription('The URL or search term')
                .setRequired(true)),
	execute: async (interaction) => {
        await interaction.deferReply();

        if (!interaction.guildId) return;

        let subscription = subscriptions.get(interaction.guildId);
        const query = interaction.options.getString('song', true);

        // check if user is in voice channel
        const member = interaction.member as any; 
        if (!member.voice.channel) {
            await interaction.followUp('You need to be in a voice channel for me to sing!');
            return;
        }

        // Create subscription if none
        if (!subscription) {
            const channel = member.voice.channel;
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            subscription = new MusicSubscription(connection);
            subscription.voiceConnection.on('error', console.warn);
            subscriptions.set(interaction.guildId, subscription);
        }

        // Make sure the connection is ready before processing the user's request
		try {
			await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20e3);
		} catch (error) {
			console.warn(error);
			await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
			return;
		}

        try {
            const trackData = await TrackFactory.getVideoData(query);

            if (!trackData) {
                 await interaction.followUp('Diu, no results found!');
                 return;
            }

            const track: Track = {
                ...trackData,
                onStart: () => {
                    (interaction.channel as any)?.send(`Now singing **${trackData.title}**!`).catch(console.warn);
                },
                onFinish: () => {
                   // Optional: Notify when finished
                },
                onError: (error) => {
                    console.warn(error);
                    (interaction.channel as any)?.send(`Diu, error singing **${trackData.title}**!`).catch(console.warn);
                } 
            };

            subscription.enqueue(track);
            await interaction.followUp(`Enqueued **${trackData.title}**`);

        } catch (error) {
            console.error(error);
            await interaction.followUp('Diu, failed to play track, please try again later!');
        }
	},
};
