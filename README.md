# 🎵 VOUXIFY — Spotify Downloader

> Download Spotify tracks and playlists as high-quality MP3 files.  
> **Made by STEVOUX** | Black × Spotify Green theme | Powered by yt-dlp + FFmpeg

---

## ✨ Features

| Feature | Detail |
|---|---|
| MP3 Mode | Download a single Spotify track |
| Playlist Mode | Download full playlist/album as ZIP |
| Quality Selector | 128 / 192 / 320 kbps |
| Album Artwork | Embedded ID3 tags + cover art |
| Real-time Progress | SSE-powered progress bar + step display |
| Multi-query Fallback | 5 YouTube search queries per track |
| Retry Logic | Exponential backoff (2s → 4s → 8s) |
| Rate Limiting | 20 requests / IP / hour |
| Proxy Support | HTTP / SOCKS5 proxy rotation |
| Cancel Download | Abort active downloads cleanly |
| Download History | Last 5 downloads in localStorage |
| Size Warning | Pre-download estimate + modal for >500 MB |

---

## 🛠 Prerequisites

Install these **before** running VOUXIFY:

### 1. Node.js 18+
Download from [https://nodejs.org](https://nodejs.org)

### 2. FFmpeg (Windows)
1. Download from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html) → "Windows builds"
2. Extract the zip
3. Add the `bin` folder to your **PATH** environment variable
4. Test: `ffmpeg -version`

### 3. yt-dlp
```powershell
# Via pip (requires Python 3.8+)
pip install yt-dlp

# Or download the .exe directly:
# https://github.com/yt-dlp/yt-dlp/releases
# Place yt-dlp.exe somewhere on your PATH
```
Test: `yt-dlp --version`

---

## 🔑 Spotify API Setup (5 minutes, free)

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in → **Create App**
   - App name: `VOUXIFY`
   - Redirect URI: `http://localhost:3000/callback`
3. Copy your **Client ID** and **Client Secret**

---

## ⚙️ Setup

```powershell
# 1. Navigate to the project
cd path/to/VOUXIFY

# 2. Install dependencies
npm install

# 3. Create your .env file
copy .env.example .env

# 4. Edit .env and fill in your Spotify credentials:
#    SPOTIFY_CLIENT_ID=your_client_id_here
#    SPOTIFY_CLIENT_SECRET=your_client_secret_here
notepad .env
```

---

## 🚀 Running

### Development (with auto-restart)
```powershell
npm run dev
```

### Production
```powershell
npm start
```

Then open: **[http://localhost:3000](http://localhost:3000)**

---

## 🐳 Docker

```bash
# Build
docker build -t vouxify .

# Run
docker run -p 3000:3000 \
  -e SPOTIFY_CLIENT_ID=your_id \
  -e SPOTIFY_CLIENT_SECRET=your_secret \
  vouxify
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server health + stats |
| GET | `/api/stats` | Job counts |
| POST | `/api/estimate` | Pre-download size estimate |
| POST | `/api/download/single` | Queue single track download |
| POST | `/api/download/playlist` | Queue playlist/album download |
| GET | `/api/progress/:taskId` | SSE progress stream |
| GET | `/api/download/:fileId` | Download the finished file |
| POST | `/api/admin/cleanup` | Force-delete temp files (requires `X-Api-Key` header) |

### POST /api/download/single
```json
{ "url": "https://open.spotify.com/track/...", "quality": 320, "includeArtwork": true }
```
Response: `{ "taskId": "uuid" }`

### GET /api/progress/:taskId (SSE Events)
```json
{ "type": "queue",    "position": 1, "total": 1 }
{ "type": "metadata", "title": "My Playlist", "totalTracks": 45 }
{ "type": "progress", "percent": 65, "step": "Downloading...", "trackIndex": 7, "trackTotal": 45 }
{ "type": "skip",     "trackName": "Song Name", "reason": "Not found on YouTube" }
{ "type": "retry",    "attempt": 2, "maxAttempts": 3, "delay": 4000, "trackName": "Song" }
{ "type": "complete", "fileId": "uuid", "filename": "Playlist.zip", "size": 52428800 }
{ "type": "error",    "message": "Download failed" }
```

---

## 🔧 Configuration (.env)

| Variable | Default | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | — | **Required** |
| `SPOTIFY_CLIENT_SECRET` | — | **Required** |
| `PORT` | `3000` | Server port |
| `MAX_CONCURRENT_DOWNLOADS` | `3` | Parallel yt-dlp workers |
| `RATE_LIMIT_REQUESTS` | `20` | Max downloads per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window (1 hour) |
| `DOWNLOAD_TIMEOUT_MS` | `300000` | Per-track timeout (5 min) |
| `FILE_TTL_MS` | `3600000` | File keep duration (1 hour) |
| `CLEANUP_INTERVAL_MS` | `3600000` | Cleanup check interval |
| `PROXY_LIST` | — | `http://user:pass@host:port,...` |
| `YT_ENDPOINTS` | `https://youtube.com` | YouTube endpoint rotation |
| `API_KEYS` | — | Admin endpoint protection |

---

## ⚠️ Disclaimer

VOUXIFY is for **educational purposes only**. Downloading copyrighted content without permission may violate Spotify's Terms of Service and copyright laws in your country. This tool does not download from Spotify directly — it searches YouTube for matching audio. Use responsibly.

---

*Made with ❤️ by STEVOUX*
