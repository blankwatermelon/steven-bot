import youtubedl from 'youtube-dl-exec';
import { GuildMember } from 'discord.js';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import path from 'path';

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

/**
 * Factory class to manage Track creation logic and separation of concerns.
 * Handles the "How do I get the song info?" part.
 */
export class TrackFactory {
    
    /**
     * Creates a TrackData object from a search query or URL.
     * @param query The search query or URL.
     * @returns A Promise that resolves to TrackData or null if not found.
     */
    public static async getVideoData(query: string): Promise<TrackData | null> {
        try {
            const output = await youtubedl(query, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificates: true,
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
            stdio: ['ignore', 'pipe', 'ignore'] 
        });

        if (!ytProcess.stdout) {
            throw new Error('No stdout from youtube-dl process');
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
        
        // Log unexpected exits
        ytProcess.on('exit', (code) => {
            if (code !== 0) {
                 console.warn(`[TrackFactory] yt-dlp process exited with code ${code}`);
                 // We don't throw here inside the stream creation, 
                 // as the stream might have already delivered some data or the consumer will handle the close.
            }
        });

        return ytProcess.stdout;
    }
}
