import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import { Command } from '../interfaces/Command';
import { MusicSubscription, subscriptions } from '../music/Subscription';
import { Track, TrackFactory, isSpotifyPlaylistUrl } from '../music/Track';

export const PlayCommand: Command = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Plays a song from YouTube')
		.addStringOption(option => 
            option.setName('song')
                .setDescription('The URL or search term')
                .setRequired(true)),
	execute: async (interaction) => {
        await interaction.reply({ content: ' **Hold up im cookin...**', flags: MessageFlags.Ephemeral });
        setTimeout(() => interaction.deleteReply().catch(console.warn), 5000);

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
            (interaction.channel as any)?.send('Ni howdy!');
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
            if (isSpotifyPlaylistUrl(query)) {
                const { name, queries } = await TrackFactory.resolveSpotifyPlaylist(query);

                if (queries.length === 0) {
                    await interaction.followUp('Diu, that playlist is empty or unavailable!');
                    return;
                }

                for (const q of queries) {
                    const track: Track = {
                        url: q,
                        title: q,
                        queuedBy: interaction.user.username,
                        onStart: () => {
                            (interaction.channel as any)?.send(`Now singing **${track.title}**!`).catch(console.warn);
                        },
                        onFinish: () => {},
                        onError: (error) => {
                            console.warn(error);
                            (interaction.channel as any)?.send(`Diu, error singing **${track.title}**!`).catch(console.warn);
                        },
                    };
                    subscription.enqueue(track);
                }

                await interaction.followUp(`Queued **${queries.length}** tracks from **${name}**! (queued by **${interaction.user.username}**)`);
                return;
            }

            const trackData = await TrackFactory.getVideoData(query);

            if (!trackData) {
                 await interaction.followUp('Diu, no results found!');
                 return;
            }

            const track: Track = {
                ...trackData,
                queuedBy: interaction.user.username,
                onStart: () => {
                    (interaction.channel as any)?.send(`Now singing **${trackData.title}**!`).catch(console.warn);
                },
                onFinish: () => {},
                onError: (error) => {
                    console.warn(error);
                    (interaction.channel as any)?.send(`Diu, error singing **${trackData.title}**!`).catch(console.warn);
                }
            };

            subscription.enqueue(track);
            await interaction.followUp(`Enqueued **${trackData.title}** (queued by **${interaction.user.username}**)`);

        } catch (error) {
            console.error(error);
            await interaction.followUp('Diu, failed to play track, please try again later!');
        }
	},
};
