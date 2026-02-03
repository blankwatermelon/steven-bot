# Discord Music Bot Design Document

## 1. Overview
This document outlines the architecture and design of a Discord Music Bot built with **TypeScript** and **Node.js**. It is capable of streaming audio from YouTube directly to a Discord voice channel. The bot is designed to be lightweight, avoiding local file storage by streaming content on-the-fly, and has been optimized for low-latency playback start times.

## 2. System Architecture

### 2.1 Interaction Model
The bot uses **Slash Commands** (Discord Interactions) rather than traditional prefix-based messages. This provides a better UI/UX and handles user inputs (like search queries) more cleanly.

### 2.2 Audio Pipeline (Optimized)
The audio system works on a **streaming** basis with a latency-optimized extraction process:
1.  **Unified Search & Extraction**: When a `/play` command is received, the bot uses `youtube-dl-exec` (wrapper for `yt-dlp`) to fetch **both** the video metadata and the direct audio stream URL in a single process execution.
    *   *Direct Mode*: If `yt-dlp` returns a direct connection URL (e.g., from Google's servers) immediately, it is used.
    *   *Fallback Mode*: If the direct URL expires or isn't fetched initially (for queued items), it is lazily fetched just before playback.
2.  **Download Strategy**: No files are written to the disk (`download=False`).
3.  **Transcoding**: `FFmpeg` (via `ffmpeg-static`) connects to the direct URL and real-time transcodes the audio to **Opus** format which Discord requires.
4.  **Transport**: The `@discordjs/voice` library sends the Opus packets via UDP to the Discord Voice Server, utilizing the **DAVE** (Discord Audio Verification/Encryption) protocol.

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

### 3.2 Music Service (Extractor)
*   **Library**: `youtube-dl-exec` (executes the `yt-dlp` binary).
*   **Optimization**:
    *   `format`: `bestaudio` (High quality streaming).
    *   `noWarnings`, `noCheckCertificates`, `dumpSingleJson`: Arguments tuned for speed and reliability.
    *   **Rapid Start**: The first track's stream URL is fetched *during* the command execution and passed directly to the player, eliminating the need for a second extraction step when playback begins.

### 3.3 Audio Player (`MusicSubscription.ts`)
*   **Role**: Manages the connection to the voice channel and sends audio data.
*   **Process**:
    *   Manages a `VoiceConnection`.
    *   Uses `createAudioResource` to stream data from the URL provided by the extractor.
    *   Handles "Idle" -> "Playing" state transitions to process the queue automatically.
    *   **Resiliency**: Auto-reconnects on temporary network disconnects or channel moves.

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
    *   *Output*: Video Metadata (Title, etc.) **AND** Direct Stream URL.
5.  **Bot** creates a `Track` object containing both the Metadata and the Stream URL.
6.  **Bot** enqueues the track.
7.  **Check**:
    *   If **Idle**: The `Subscription` sees the `Track` has a `streamUrl` pre-loaded. It skips the extraction step and streams immediately.
    *   If **Playing**: Adds to queue. Only metadata is stored; the Stream URL (which might expire) is discarded or lazily refreshed when the song eventually plays.

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
    *   `ffmpeg-static`: Portable FFmpeg binary.
    *   `libsodium-wrappers` & `@snazzah/davey`: Encryption support.

## 7. Pseudo-Code (Language Agnostic)

```text
Global Map queues;

Function PlayCommand(user, query):
    voiceConn = ConnectToChannel(user.voiceChannel)
    songInfo = YouTubeExtract(query) // Get URL without downloading
    
    queues[guildID].push(songInfo)
    
    If NOT voiceConn.isPlaying:
        PlayNext(guildID)

Function PlayNext(guildID):
    If queues[guildID] is empty:
        voiceConn.Disconnect()
        Return

    song = queues[guildID].pop()
    
    // Create Stream
    stream = NewFFmpegStream(song.url, Options{
        Bitrate: 192k,
        Channels: 2 (Stereo)
    })
    
    // Play with Callback
    voiceConn.Play(stream, OnFinish: () => {
        PlayNext(guildID) // Recursive call
    })
```
