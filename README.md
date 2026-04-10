# steven-bot

A lightweight, high-performance Discord music bot built with TypeScript and Node.js. Streams audio directly from YouTube to Discord voice channels using high-quality Opus encoding — no files saved to disk.

## Features

- **Slash commands**: Modern Discord interaction experience (`/play`, `/skip`, `/queue`, `/leave`, `/clean`).
- **YouTube support**: Play from direct URLs or plain-text search queries. Searches default to lyrics videos.
- **Spotify support**: Play individual Spotify track URLs or queue entire playlists and albums (up to 100 tracks).
- **Queue system**: Per-server FIFO queue with upcoming track display.
- **Reliable streaming**: Audio piped directly from `yt-dlp` as a raw stream — no premature cutoffs or buffering issues.
- **Channel cleanup**: `/clean` removes all bot messages in a channel, paginating through full history and handling both recent and older messages.
- **Auto-disconnect**: Destroys the voice connection and clears the queue on `/leave`.

## Prerequisites

- **Node.js** v18.0.0 or higher
- **Python**: required by `yt-dlp` for audio extraction
- **FFmpeg**: bundled via `ffmpeg-static` — no separate install needed
- **Discord bot token**: obtain one from the [Discord Developer Portal](https://discord.com/developers/applications)

## Installation

1. Clone the repository.

   ```bash
   git clone https://github.com/yourusername/steven-bot.git
   cd steven-bot
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root and add your bot token.

   ```env
   DISCORD_TOKEN=your_token_here
   ```

## Running the bot

### Development

Uses `nodemon` for automatic restarts on file changes.

```bash
npm run dev
```

### Production

Runs directly with `ts-node`.

```bash
npm start
```

To compile to JavaScript first:

```bash
npm run build
node dist/index.js
```

## Commands

| Command | Description |
| :--- | :--- |
| `/play song:<query>` | Plays a track or queues it if something is already playing. Accepts a YouTube URL, a plain-text search term, a Spotify track URL, or a Spotify playlist/album URL. |
| `/skip` | Skips the currently playing track and advances the queue. |
| `/queue` | Shows the currently playing track and up to 5 upcoming tracks. |
| `/leave` | Stops playback, clears the queue, and disconnects from the voice channel. |
| `/clean` | Deletes all messages sent by the bot in the current channel. Requires the **Manage Messages** permission. Response is ephemeral (only visible to the user who ran the command). |

### `/play` input types

| Input | Behavior |
| :--- | :--- |
| YouTube URL | Plays the video directly. |
| Plain-text search | Appends `lyrics` to the query and picks the top YouTube result. |
| Spotify track URL (`open.spotify.com/track/…`) | Resolves the track title and artist, then searches YouTube with `lyrics` appended. |
| Spotify playlist or album URL (`open.spotify.com/playlist/…` or `open.spotify.com/album/…`) | Resolves up to 100 tracks and enqueues them all. Each track is searched on YouTube when it reaches the front of the queue. |

## How it works

1. A user runs `/play` with a query.
2. `TrackFactory.getVideoData` resolves the query — Spotify URLs are converted to a `"artist - title lyrics"` search string; plain-text queries have `lyrics` appended; YouTube URLs are used as-is.
3. `yt-dlp` fetches video metadata and selects the best audio format (`bestaudio[ext=webm][acodec=opus][asr=48000]`).
4. When a track begins playback, `TrackFactory.getStream` spawns a `yt-dlp` subprocess and pipes its stdout directly into FFmpeg, which transcodes the stream to Opus packets.
5. `@discordjs/voice` encrypts and transmits the Opus packets to Discord's voice servers over UDP.

## Dependencies

| Package | Purpose |
| :--- | :--- |
| `discord.js` | Discord gateway and REST client |
| `@discordjs/voice` | Voice connection and audio player |
| `youtube-dl-exec` | `yt-dlp` wrapper for metadata resolution |
| `ffmpeg-static` | Bundled FFmpeg binary |
| `spotify-url-info` | Resolves Spotify track/playlist metadata |
| `undici` | Fetch implementation used by `spotify-url-info` |
| `libsodium-wrappers` | Encryption for voice packets |
| `opusscript` | Opus audio codec |
| `dotenv` | Loads environment variables from `.env` |
