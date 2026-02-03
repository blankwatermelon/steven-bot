# Steven Bot 🎵

A lightweight, high-performance Discord Music Bot built with TypeScript and Node.js. It streams audio directly from YouTube to Discord voice channels using high-quality Opus encoding without saving files to disk.

## ✨ Features

*   **Slash Commands**: Modern Discord interaction experience (`/play`, `/skip`, `/queue`, `/leave`).
*   **YouTube Support**: Play directly from URLs or search queries.
*   **High Quality Audio**: Streams audio using `yt-dlp` and `ffmpeg` for optimal quality.
*   **Latency Optimized**: Optimizes extraction to minimize the delay between command and playback.
*   **Queue System**: internal FIFO queue to manage playlists per server.
*   **TypeScript**: Built with type safety and modern ES standards.

## 🚀 Prerequisites

*   **Node.js**: v16.11.0 or higher.
*   **Python**: Required for `yt-dlp` (extracts audio URLs).
*   **Discord Bot Token**: You need a valid token from the [Discord Developer Portal](https://discord.com/developers/applications).

## 🛠️ Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/steven-bot.git
    cd steven-bot
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the root directory (you can copy `.env.example`):
    ```bash
    cp .env.example .env
    ```
    Open `.env` and add your bot token:
    ```env
    DISCORD_TOKEN=your_token_here_from_discord_portal
    ```

4.  **Build (Optional for Dev)**
    The project uses TypeScript. You can run it directly with `ts-node` in dev or build it for production.
    ```bash
    npm run build
    ```

## ▶️ Running the Bot

### Development
Runs with `nodemon` and `ts-node` for hot-reloading.
```bash
npm run dev
```

### Production
Builds the TypeScript code and runs the compiled JavaScript.
```bash
npm run build
npm start
```

## 🎮 Commands

| Command | Description | Usage |
| :--- | :--- | :--- |
| `/play` | Plays a song from a YouTube link or search query. | `/play song:never gonna give you up` |
| `/skip` | Skips the currently playing song. | `/skip` |
| `/queue` | Shows the current playing song and up to 5 upcoming tracks. | `/queue` |
| `/leave` | Stops music, clears the queue, and leaves the voice channel. | `/leave` |

## ⚙️ How It Works

1.  **Interaction**: User sends a `/play` command.
2.  **Extraction**: The bot uses `youtube-dl-exec` (a wrapper for `yt-dlp`) to fetch video metadata and the direct raw audio stream URL (e.g., from Google's servers).
3.  **Optimization**: The extraction happens in a single pass to fetch both metadata and the stream URL simultaneously, reducing initial latency.
4.  **Audio Pipeline**: The Direct URL is piped into `FFmpeg` (provided by `ffmpeg-static`) to transcode the stream into Opus packets.
5.  **Transmission**: Packets are encrypted and sent via UDP to Discord's Voice Servers using `@discordjs/voice`.
