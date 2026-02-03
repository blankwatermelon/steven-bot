# Discord Music Bot Design Document

## 1. Overview
This document outlines the architecture and design of a Discord Music Bot capable of streaming audio from YouTube directly to a Discord voice channel. The bot is designed to be lightweight, avoiding local file storage by streaming content on-the-fly.

## 2. System Architecture

### 2.1 Interaction Model
The bot uses **Slash Commands** (Discord Interactions) rather than traditional prefix-based messages. This provides a better UI/UX and handles user inputs (like search queries) more cleanly.

### 2.2 Audio Pipeline
The audio system works on a **streaming** basis:
1.  **Search**: `yt-dlp` searches YouTube for metadata and extracts the direct audio stream URL (e.g., a `.webm` or `.m4a` link from Google's servers).
2.  **Download Strategy**: No files are written to the disk (`download=False`).
3.  **Transcoding**: `FFmpeg` connects to the direct URL and real-time transcodes the audio to **Opus** format which Discord requires.
4.  **Transport**: The Discord library sends the Opus packets via UDP to the Discord Voice Server.

### 2.3 State Management
*   **Scope**: State is managed per **Guild** (Server). This creates a multi-tenant architecture where playing music in Server A does not affect Server B.
*   **Storage**: In-memory Dictionary.
    *   Key: `Guild ID` (String)
    *   Value: `Queue` (FIFO collection) of songs.

## 3. Core Components

### 3.1 Command Handler
Registers slash commands with Discord and routes incoming interactions to specific functions. It handles deferrals (`await interaction.response.defer()`) to prevent timeouts during long API calls.

### 3.2 Music Service (Extractor)
*   **Role**: Interfaces with YouTube.
*   **Library Equivalent**: `yt-dlp` (Python), `ytdl-core` (Node.js), `Lavalink` (Java - external service).
*   **Configuration**:
    *   `format`: `bestaudio` (High quality streaming).
    *   `noplaylist`: True (Single song only).
    *   `download`: False (Memory-only extraction).

### 3.3 Audio Player
*   **Role**: Manages the connection to the voice channel and sends audio data.
*   **Process**:
    *   Requires a "Voice Connection" to a specific channel.
    *   Spawns an FFmpeg process to handle streams.
    *   **Stereo Injection**: Forces 2 channels (`-ac 2`) and High Bitrate (`192k`).

### 3.4 Queue Manager
A queue processing system that handles the playlist logic.
*   **Structure**: `Map<GuildID, Deque<(URL, Title)>>`
*   **Logic**:
    1.  User adds song -> Push to back of Queue.
    2.  Player finishes song -> Trigger `after_play` callback -> Pop from front of Queue -> Play.

## 4. Control Flows

### 4.1 Play Command Flow
1.  **User** connects to Voice Channel and invokes `/play query`.
2.  **Bot** defers response (shows "Thinking...").
3.  **Bot** checks if connected to voice; if not, connects.
4.  **Bot** runs `yt-dlp` search (Blocking I/O moved to background thread).
5.  **Bot** extracts direct URL.
6.  **Bot** adds song to `Queue`.
7.  **Check**:
    *   If **Playing**: Send "Added to queue" message.
    *   If **Idle**: Play immediately.

### 4.2 Play Next Logic (The Loop)
This is a recursive or callback-based loop that ensures continuous playback.
1.  **Event**: Song finishes (or error occurs).
2.  **Action**: Check `Queue` for `GuildID`.
3.  **Condition**:
    *   **Queue Empty**: Disconnect connection / Wait.
    *   **Queue Has Items**:
        1.  Pop next Item `(URL, Title)`.
        2.  Create FFmpeg Audio Source.
        3.  Start Playback.
        4.  Register `after_play` callback to point back to Step 1.

## 5. Command Interface

| Command | Parameter | Description |
| :--- | :--- | :--- |
| `/play` | `song_query` (String) | Searches YouTube and adds to queue (or plays if empty). |
| `/skip` | None | Stops current track. The `on_finish` handler will automatically play the next track. |
| `/pause` | None | Pauses the audio stream without disconnecting. |
| `/resume` | None | Resumes a paused stream. |
| `/stop` | None | Clears the queue and disconnects the bot from the voice channel. |

## 6. Implementation Requirements (for different languages)

If porting this to another language (e.g., JavaScript/Node.js, Go, C#), ensure the following prerequisites are met:

1.  **Discord Library**: Must check support for **Voice** and **Slash Commands**.
    *   *Node.js*: `discord.js` + `@discordjs/voice`.
    *   *Go*: `discordgo`.
    *   *C#*: `Discord.Net`.
2.  **FFmpeg**: The host machine must have FFmpeg installed and accessible in the system PATH.
3.  **Opus Support**: Discord voice requires Opus encoding. Some libraries need a native binding (like `sodium` or `opusscript`).
4.  **Youtube Extractor**: You need a reliable way to get the *direct stream URL*. `yt-dlp` works best as a subprocess, but native libraries exist.

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
