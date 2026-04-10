import youtubedl from 'youtube-dl-exec';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import path from 'path';
import { fetch } from 'undici';

// spotify-url-info exports a factory function as default (CJS)
const createSpotify = require('spotify-url-info');
const spotify = createSpotify(fetch);

// Resolve the path to the yt-dlp binary provided by youtube-dl-exec
const ytDlpPath = path.resolve(require.resolve('youtube-dl-exec'), '../../bin/yt-dlp');

export interface Track {
	url: string;
	title: string;
    streamUrl?: string; // Pre-fetched stream URL if available
	onStart: () => void;
	onFinish: () => void;
	onError: (error: Error) => void;
}

export interface TrackData {
    url: string;
    title: string;
    streamUrl?: string;
}

function isUrl(query: string): boolean {
    return query.startsWith('http://') || query.startsWith('https://') ||
           query.includes('youtube.com') || query.includes('youtu.be');
}

function isSpotifyTrackUrl(query: string): boolean {
    return query.includes('open.spotify.com/track/');
}

export function isSpotifyPlaylistUrl(query: string): boolean {
    return query.includes('open.spotify.com/playlist/') || query.includes('open.spotify.com/album/');
}

/**
 * Factory class to manage Track creation logic and separation of concerns.
 * Handles the "How do I get the song info?" part.
 */
export class TrackFactory {

    /**
     * Resolves a Spotify playlist/album URL to an array of search query strings (up to 100 tracks).
     */
    public static async resolveSpotifyPlaylist(spotifyUrl: string): Promise<{ name: string; queries: string[] }> {
        const details = await spotify.getDetails(spotifyUrl);
        const name: string = details.preview?.title ?? 'Playlist';
        const queries: string[] = (details.tracks ?? [])
            .slice(0, 100)
            .map((t: any) => {
                const title: string = t.name ?? t.title ?? '';
                const artist: string = t.artists?.[0]?.name ?? t.artist ?? '';
                return artist ? `${artist} - ${title} lyrics` : `${title} lyrics`;
            })
            .filter(Boolean);
        return { name, queries };
    }

    /**
     * Resolves a Spotify track URL to a YouTube search query string.
     */
    private static async resolveSpotify(spotifyUrl: string): Promise<string> {
        const preview = await spotify.getPreview(spotifyUrl);
        const title: string = preview.title;
        const artist: string = preview.artist || '';
        return artist ? `${artist} - ${title}` : title;
    }

    /**
     * Creates a TrackData object from a search query or URL.
     * @param query The search query or URL.
     * @returns A Promise that resolves to TrackData or null if not found.
     */
    public static async getVideoData(query: string): Promise<TrackData | null> {
        try {
            let resolvedQuery = query;

            if (isSpotifyTrackUrl(query)) {
                resolvedQuery = await TrackFactory.resolveSpotify(query);
                resolvedQuery += ' lyrics';
            } else if (!isUrl(resolvedQuery)) {
                resolvedQuery += ' lyrics';
            }

            const output = await youtubedl(resolvedQuery, {
                dumpSingleJson: true,
                noWarnings: true,
                defaultSearch: 'ytsearch1',
                format: 'bestaudio',
                noPlaylist: true,
            });

            let videoInfo: any;

            if ((output as any).entries && (output as any).entries.length > 0) {
                 videoInfo = (output as any).entries[0];
            } else if ((output as any).entries && (output as any).entries.length === 0) {
                 return null;
            } else {
                 videoInfo = output;
            }

            const url = videoInfo.webpage_url || videoInfo.url;
            const title = videoInfo.title;
            // Removed optimistic streamUrl fetching as we want to use the raw stream method for reliability
            
            if (!url) return null;

            return {
                url,
                title
            };
        } catch (error) {
            console.warn('TrackFactory Error:', error);
            throw error;
        }
    }

    /**
     * Creates a Readable stream for the given video URL.
     * This uses yt-dlp to download the audio and pipe it directly, preventing early termination.
     * @param url The video URL.
     * @returns A Readable stream of the audio.
     */
    public static getStream(url: string): Readable {
        // Use native spawn instead of youtube-dl-exec wrapper to avoid unhandled errors
        // from tinyspawn when the process exits with non-zero code (e.g. 403 Forbidden).
        const ytProcess = spawn(ytDlpPath, [
            url,
            '--output', '-',
            '--format', 'bestaudio[ext=webm][acodec=opus][asr=48000]/bestaudio',
            '--quiet',
            '--no-warnings',
            '--no-check-certificates'
        ], {
            stdio: ['ignore', 'pipe', process.env.NODE_ENV === 'production' ? 'ignore' : 'pipe']
        });

        if (!ytProcess.stdout) {
            throw new Error('No stdout from youtube-dl process');
        }

        if (ytProcess.stderr) {
            ytProcess.stderr.pipe(process.stderr);
        }

        const stream = ytProcess.stdout;
        const onError = (error: Error) => {
             if (!stream.destroyed) stream.emit('error', error);
        };
        
        // Add error listener to prevent Node.js crash on process error
        ytProcess.on('error', (error) => {
            console.error('[TrackFactory] yt-dlp process error:', error);
            onError(error);
        });
        
        ytProcess.on('exit', (code) => {
            if (code !== 0) {
                console.warn(`[TrackFactory] yt-dlp process exited with code ${code}`);
                if (!stream.destroyed) stream.emit('error', new Error(`yt-dlp exited with code ${code}`));
            }
        });

        stream.on('close', () => {
            if (!ytProcess.killed) ytProcess.kill();
        });

        return stream;
    }
}
