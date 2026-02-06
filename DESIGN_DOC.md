# Discord Music Bot Design Document

## 1. Overview
This document outlines the architecture and design of a Discord Music Bot built with **TypeScript** and **Node.js**. It is capable of streaming audio from YouTube directly to a Discord voice channel. The bot is designed to be lightweight, avoiding local file storage by streaming content on-the-fly, and has been optimized for low-latency playback start times.

## 2. System Architecture

### 2.1 Interaction Model
The bot uses **Slash Commands** (Discord Interactions) rather than traditional prefix-based messages. This provides a better UI/UX and handles user inputs (like search queries) more cleanly.

### 2.2 Audio Pipeline (Optimized)
The audio system works on a **streaming** basis with a latency-optimized extraction process:
1.  **Unified Search & Extraction**: When a `/play` command is received, the `TrackFactory` uses `youtube-dl-exec` (wrapper for `yt-dlp`) to fetch video metadata.
2.  **Piped Streaming**: Instead of fetching a direct URL (which can expire or be throttled), the bot spawns a child `yt-dlp` process that downloads audio and writes it to `stdout`.
3.  **Transcoding**: This execution stream is piped directly into the Discord Voice connection. The stream is forced to **Webm/Opus** format (`bestaudio[ext=webm][acodec=opus][asr=48000]/bestaudio`) to minimize transcoding overhead.
4.  **Transport**: The `@discordjs/voice` library sends the Opus packets via UDP to the Discord Voice Server.

### 2.3 State Management
*   **Scope**: State is managed per **Guild** (Server). This creates a multi-tenant architecture where playing music in Server A does not affect Server B.
*   **Storage**: In-memory `Map`.
    *   Key: `Guild ID` (`Snowflake`)
    *   Value: `MusicSubscription` object containing:
        *   `VoiceConnection`
        *   `AudioPlayer`
        *   `Queue` (FIFO Array of `Track` objects)

## 3. Core Components

### 3.1 Command Handler
Registers slash commands with Discord using `discord.js`. It routes incoming interactions to specific command files (`src/commands/*.ts`). It handles deferrals (`await interaction.deferReply()`) to prevent timeouts during the `yt-dlp` extraction process.

### 3.2 TrackFactory (Extractor)
A centralized factory class (`src/music/Track.ts`) responsible for resolving media:
*   **Resolution**: Converts search queries or URLs into `TrackData` objects.
*   **Stream Generation**: Generates `Readable` streams using `yt-dlp`'s `exec` function.
    *   **Latency Optimization**: Removed bandwidth limiting (`limit-rate`) to allow maximum burst speed for initial buffering.
    *   **Format Targeting**: Requests `bestaudio[ext=webm][acodec=opus][asr=48000]/bestaudio` specifically for Discord compatibility.
    *   **Abstraction**: Decouples the "Search" logic from the "Play" logic.

### 3.3 Audio Player (`MusicSubscription.ts`)
*   **Role**: Manages the connection to the voice channel and sends audio data.
*   **Process**:
    *   Manages a `VoiceConnection`.
    *   Uses `createAudioResource` with `StreamType.WebmOpus` to pipe data efficiently.
    *   **Auto-Disconnect**: Automatically destroys the connection after 30 seconds of inactivity (Idle state) to save resources.
    *   **Resiliency**: Auto-reconnects on temporary network disconnects or channel moves with exponential backoff logic (protected against negative timeout errors).

### 3.4 Queue Manager
A queue processing system that handles the playlist logic.
*   **Structure**: `Array<Track>` inside `MusicSubscription`.
*   **Logic**:
    1.  User adds song -> Push to `queue`.
    2.  If player is Idle -> Process immediately.
    3.  Player finishes song -> Trigger `AudioPlayerStatus.Idle` event -> Shift next track from queue -> Play.

## 4. Control Flows

### 4.1 Play Command Flow (Optimized)
1.  **User** connects to Voice Channel and invokes `/play query`.
2.  **Bot** defers response.
3.  **Bot** checks connectivity; joins voice channel if needed.
4.  **Bot** executes `yt-dlp` search.
    *   *Output*: Video Metadata (Title, etc.). Direct stream URL generation is deferred to playback time for reliability.
5.  **Bot** creates a `Track` object containing the Metadata.
6.  **Bot** enqueues the track.
7.  **Check**:
    *   If **Idle**: The `Subscription` processes the queue immediately.
    *   If **Playing**: Adds to queue. Metadata is stored; the Stream is created only when the song actually starts playing.

### 4.2 Play Next Logic
1.  **Event**: Song finishes.
2.  **Action**: `AudioPlayer` enters `Idle` state.
3.  **Logic**:
    *   Check `queue` length.
    *   If empty: Wait / Do nothing.
    *   If has items:
        1.  Shift next `Track`.
        2.  Check for `streamUrl`. If missing (expired or not fetched), run `yt-dlp` specifically for this URL.
        3.  Create Audio Resource.
        4.  Play.

## 5. Command Interface

| Command | Parameter | Description |
| :--- | :--- | :--- |
| `/play` | `song` (String) | Searches YouTube and adds to queue. Starts playback immediately if idle. |
| `/skip` | None | Stops the current resource. The player handles the transition to the next song automatically. |
| `/queue` | None | Displays the currently playing song and the next 5 tracks. |
| `/leave` | None | Destroys the voice connection and clears the queue. |

## 6. Implementation Notes

*   **Language**: TypeScript / Node.js.
*   **Dependencies**:
    *   `discord.js`: REST/WebSocket interaction.
    *   `@discordjs/voice`: Audio packet sending.
    *   `youtube-dl-exec`: YouTube extraction.
    *   `ffmpeg-static`: Portable FFmpeg binary. The bot automatically injects this into the `PATH` at runtime (`src/index.ts`) so external dependencies like `yt-dlp` can find it.
    *   `libsodium-wrappers`: Encryption support.


