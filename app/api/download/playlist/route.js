import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { parseSpotifyUrl, getPlaylistTracks, getAlbumTracks } from '@/lib/spotify';
import { downloadWithRetry } from '@/lib/downloader';
import { buildFilename } from '@/lib/utils/sanitize';
import { createZip } from '@/lib/utils/zip';

export const maxDuration = 300; // Vercel Pro: up to 300s

const enc = new TextEncoder();

function sseEvent(data) {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/download/playlist
 * Body: { url, quality, includeArtwork }
 * Returns: text/event-stream — SSE events, ends with complete { fileId, filename, size, skipped }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { url, quality = 192, includeArtwork = true } = body;
  const parsed = parseSpotifyUrl(url);

  if (!parsed || parsed.type === 'track') {
    return new Response(JSON.stringify({ error: 'Invalid Spotify playlist/album URL. Must contain /playlist/ or /album/' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fileId = uuid();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        try { controller.enqueue(sseEvent(data)); } catch (_) {}
      };

      const ping = setInterval(() => {
        try { controller.enqueue(enc.encode(': ping\n\n')); } catch (_) { clearInterval(ping); }
      }, 15000);

      try {
        send({ type: 'start', mode: 'playlist' });

        // Fetch track list from Spotify
        let collection;
        if (parsed.type === 'playlist') {
          collection = await getPlaylistTracks(parsed.id);
        } else {
          collection = await getAlbumTracks(parsed.id);
        }

        const { name: playlistName, tracks } = collection;
        send({ type: 'metadata', title: playlistName, totalTracks: tracks.length });

        const downloadedFiles = [];
        const skipped = [];

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          send({
            type: 'progress',
            percent: Math.round((i / tracks.length) * 85),
            step: `Downloading track ${i + 1} of ${tracks.length}…`,
            trackIndex: i + 1,
            trackTotal: tracks.length,
            trackName: `${track.artist} - ${track.title}`,
            eta: null,
          });

          try {
            const tmpPath = await downloadWithRetry(
              track,
              parseInt(quality),
              includeArtwork,
              (pct, step) => {
                const overallPct = Math.round(((i + pct / 100) / tracks.length) * 85);
                send({
                  type: 'progress',
                  percent: overallPct,
                  step,
                  trackIndex: i + 1,
                  trackTotal: tracks.length,
                  trackName: `${track.artist} - ${track.title}`,
                });
              },
              (attempt, maxAttempts, delayMs) => {
                send({ type: 'retry', attempt, maxAttempts, delay: delayMs, trackName: track.title });
              },
              null,
              3
            );

            const archiveName = buildFilename(i + 1, track.artist, track.title);
            downloadedFiles.push({ filePath: tmpPath, archiveName });

          } catch (err) {
            console.warn(`[PLAYLIST] Skipping "${track.title}": ${err.message}`);
            skipped.push(track.title);
            send({
              type: 'skip',
              trackName: track.title,
              reason: err.message.includes('No YouTube match') ? 'Not found on YouTube' : 'Download failed',
            });
          }
        }

        if (!downloadedFiles.length) {
          throw new Error('No tracks could be downloaded');
        }

        // Build ZIP
        send({ type: 'progress', percent: 90, step: 'Creating ZIP archive…', trackIndex: tracks.length, trackTotal: tracks.length });
        const zipPath = path.join(os.tmpdir(), `${fileId}.zip`);
        await createZip(downloadedFiles, zipPath, playlistName);

        // Clean up individual mp3 temp files
        for (const { filePath } of downloadedFiles) fs.unlink(filePath, () => {});

        const size = fs.statSync(zipPath).size;

        send({ type: 'progress', percent: 100, step: 'Complete!', trackIndex: tracks.length, trackTotal: tracks.length });
        send({ type: 'complete', fileId, filename: `${playlistName}.zip`, size, skipped });

      } catch (err) {
        send({ type: 'error', message: err.message || 'Playlist download failed. Please try again.' });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    },
  });
}
