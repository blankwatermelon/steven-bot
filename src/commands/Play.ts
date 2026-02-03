import { SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { Command } from '../interfaces/Command';
import { MusicSubscription, subscriptions, Track } from '../music/Subscription';
import youtubedl from 'youtube-dl-exec';

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
            await interaction.followUp('You need to be in a voice channel to play music!');
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
            // Search logic logic
            let url = query;
            let title = 'Unknown Title';
            let streamUrl: string | undefined;

            const output = await youtubedl(query, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificates: true,
                defaultSearch: 'ytsearch1',
                format: 'bestaudio', // Ask for best audio immediately
            });

            let videoInfo: any;
            
            // TypeScript check for the output type, assuming it mimics the JSON structure
            if ((output as any).entries && (output as any).entries.length > 0) {
                 videoInfo = (output as any).entries[0];
            } else if ((output as any).entries && (output as any).entries.length === 0) {
                 await interaction.followUp('No results found!');
                 return;
            } else {
                 videoInfo = output;
            }

            // Prefer webpage_url, fallback to url (which might be the ID or internal URL)
            url = videoInfo.webpage_url || videoInfo.url;
            title = videoInfo.title;
            // Optimistically grab the stream URL if available
            if (videoInfo.url && videoInfo.url.startsWith('http')) {
                streamUrl = videoInfo.url;
            }

            if (!url) {
                 await interaction.followUp('Could not resolve video URL.');
                 return;
            }

            const track: Track = {
                url,
                title,
                streamUrl,
                onStart: () => {
                    (interaction.channel as any)?.send(`Now singing **${title}**!`).catch(console.warn);
                },
                onFinish: () => {
                   // Optional: Notify when finished
                },
                onError: (error) => {
                    console.warn(error);
                    (interaction.channel as any)?.send(`Error singing **${title}**!`).catch(console.warn);
                } 
            };

            subscription.enqueue(track);
            await interaction.followUp(`Enqueued **${title}**`);

        } catch (error) {
            console.error(error);
            await interaction.followUp('Failed to play track, please try again later!');
        }
	},
};
