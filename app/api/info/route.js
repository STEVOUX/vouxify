import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

function getYtDlpPath() {
  const candidates = [
    path.join(process.cwd(), 'bin', 'yt-dlp.exe'),
    path.join(process.cwd(), 'yt-dlp.exe'),
    path.join(process.cwd(), 'bin', 'yt-dlp'),
    'yt-dlp',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp';
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const ytDlp = getYtDlpPath();
    const args = ['--dump-json', '--no-warnings', '--js-runtimes', 'node', url];

    // If it's a YouTube or Spotify playlist, use flat-playlist to prevent fetching deep metadata for 100s of videos
    if (url.includes('playlist') || url.includes('spotify.com/album') || url.includes('spotify.com/playlist')) {
      args.push('--flat-playlist');
    }

    // Auth — if Instagram, use cookies or username/password to avoid login blocks
    if (url.includes('instagram.com')) {
      const igCookiesPath = path.join(process.cwd(), 'ig_cookies.txt');
      if (fs.existsSync(igCookiesPath)) {
        args.push('--cookies', igCookiesPath);
      } else {
        const igUser = process.env.INSTAGRAM_USERNAME;
        const igPass = process.env.INSTAGRAM_PASSWORD;
        if (igUser && igPass) {
          args.push('--username', igUser, '--password', igPass);
        }
      }
    }

    const { stdout } = await execFileAsync(ytDlp, args, { timeout: 30000 });
    
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) throw new Error('No metadata returned from yt-dlp');
    const items = lines.map(line => JSON.parse(line));
    
    // If it's a playlist/carousel, return the array directly. 
    // If it's a single item, we still return an array to keep the API consistent, 
    // or we can process the first item's formats and return { ...item, isPlaylist: true, items: [...] }.
    
    // Let's structure the response
    const isPlaylist = items.length > 1 || items[0]._type === 'playlist';
    
    // Process formats for the first item (to determine global quality options)
    const data = items[0]._type === 'playlist' ? items[0].entries?.[0] || items[0] : items[0];

    // Parse formats
    const videoFormats = [];
    const audioFormats = [];

    if (data.formats && Array.isArray(data.formats)) {
      // Find best audio size for estimating combined video sizes
      const bestAudio = data.formats
        .filter(f => f.vcodec === 'none' && f.acodec !== 'none')
        .sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];
      const audioSize = bestAudio ? (bestAudio.filesize || bestAudio.filesize_approx || 0) : 0;

      // Map formats
      data.formats.forEach(f => {
        let size = f.filesize;
        let isExact = true;
        
        if (!size && f.filesize_approx) {
            size = f.filesize_approx;
            isExact = false;
        } else if (!size && f.tbr && data.duration) {
            size = (f.tbr * 1000 / 8) * data.duration;
            isExact = false;
        } else if (!size && f.vbr && data.duration) {
            size = ((f.vbr + (f.abr || 0)) * 1000 / 8) * data.duration;
            isExact = false;
        } else if (!size) {
            size = 0;
            isExact = false;
        }
        
        // Audio only
        if (f.vcodec === 'none' && f.acodec !== 'none') {
            audioFormats.push({
                format_id: f.format_id,
                ext: f.ext,
                abr: f.abr,
                sizeBytes: size,
                sizeStr: formatBytes(size),
                isExact: isExact,
                quality: `${Math.round(f.abr || 128)} kbps`,
            });
        } 
        // Video
        else if (f.vcodec !== 'none') {
            // yt-dlp often returns video-only streams. We add the estimated audio size.
            const totalSize = (f.acodec === 'none' ? size + audioSize : size);
            const totalIsExact = isExact && (f.acodec === 'none' ? false : true);
            
            videoFormats.push({
                format_id: f.format_id,
                ext: f.ext,
                height: f.height,
                width: f.width,
                fps: f.fps,
                vcodec: f.vcodec,
                acodec: f.acodec,
                sizeBytes: totalSize,
                sizeStr: formatBytes(totalSize),
                isExact: totalIsExact,
                quality: f.height ? `${f.height}p` : 'Unknown',
            });
        }
      });
    }

    // Sort and deduplicate video formats by height (descending)
    const uniqueVideoFormats = [];
    const seenHeights = new Set();
    videoFormats
        .sort((a, b) => {
            // Sort by height descending
            if ((b.height || 0) !== (a.height || 0)) return (b.height || 0) - (a.height || 0);
            // If same height, prefer mp4 over webm
            if (a.ext === 'mp4' && b.ext !== 'mp4') return -1;
            if (b.ext === 'mp4' && a.ext !== 'mp4') return 1;
            return 0;
        })
        .forEach(f => {
            if (f.height && !seenHeights.has(f.height)) {
                seenHeights.add(f.height);
                uniqueVideoFormats.push(f);
            }
        });
        
    // Sort audio
    const uniqueAudioFormats = audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));

    return NextResponse.json({
      title: data.title || data.fulltitle || 'Media File',
      thumbnail: data.thumbnail,
      duration: data.duration,
      formats: {
        video: uniqueVideoFormats,
        audio: [
          { format_id: '320', quality: '320 kbps', sizeBytes: (320 * 1000 / 8) * (data.duration || 0), sizeStr: formatBytes((320 * 1000 / 8) * (data.duration || 0)), isExact: false },
          { format_id: '256', quality: '256 kbps', sizeBytes: (256 * 1000 / 8) * (data.duration || 0), sizeStr: formatBytes((256 * 1000 / 8) * (data.duration || 0)), isExact: false },
          { format_id: '192', quality: '192 kbps', sizeBytes: (192 * 1000 / 8) * (data.duration || 0), sizeStr: formatBytes((192 * 1000 / 8) * (data.duration || 0)), isExact: false },
          { format_id: '128', quality: '128 kbps', sizeBytes: (128 * 1000 / 8) * (data.duration || 0), sizeStr: formatBytes((128 * 1000 / 8) * (data.duration || 0)), isExact: false },
        ]
      },
      isPlaylist,
      items: items.map(item => {
        const reqFmts = item.requested_formats || [];
        const videoFmt = reqFmts.find(f => f.vcodec !== 'none') || reqFmts[0];
        const audioFmt = reqFmts.find(f => f.vcodec === 'none' && f.acodec !== 'none') || (reqFmts.length > 1 ? reqFmts[1] : null);

        return {
          id: item.id,
          title: item.title || item.fulltitle || 'Item',
          thumbnail: item.thumbnail || data.thumbnail,
          url: item.url || (videoFmt ? videoFmt.url : null) || item.webpage_url || data.webpage_url,
          audioUrl: audioFmt ? audioFmt.url : null,
          duration: item.duration,
          ext: item.ext || (videoFmt ? videoFmt.ext : null),
          vcodec: item.vcodec || (videoFmt ? videoFmt.vcodec : null)
        };
      })
    });

  } catch (err) {
    if (url.includes('instagram.com')) {
      try {
        const { instagramGetUrl } = require('instagram-url-direct');
        const igData = await instagramGetUrl(url);
        if (igData && igData.url_list && igData.url_list.length > 0) {
          const title = igData.post_info?.caption?.split('\n')[0] || igData.post_info?.owner_username || 'Instagram Post';
          const items = igData.url_list.map((u, i) => ({
            id: `ig_${i}`,
            title: `${title} - Part ${i + 1}`,
            thumbnail: u,
            url: u,
            vcodec: 'image',
            ext: u.includes('.mp4') ? 'mp4' : 'jpg'
          }));
          return NextResponse.json({
            title: title,
            thumbnail: igData.url_list[0],
            duration: 0,
            formats: {
              video: [{ format_id: 'best', format_note: 'Original', ext: 'jpg' }],
              audio: []
            },
            isPlaylist: items.length > 1,
            items: items.length > 1 ? items : undefined,
            singleUrl: items.length === 1 ? items[0].url : undefined
          });
        }
      } catch (igErr) {
        console.error('Info fallback failed:', igErr);
      }
    }

    console.error('Info extraction failed:', err.message);
    let msg = 'Failed to fetch media info';
    if (err.stderr) {
       const s = err.stderr.toLowerCase();
       if (s.includes('login') || s.includes('private') || s.includes('empty media') || s.includes('not granting access')) {
         msg = 'This post is private or requires login. We cannot access it without an account.';
       } else if (s.includes('not found') || s.includes('unavailable')) {
         msg = 'Post not found or unavailable.';
       } else {
         const lines = err.stderr.split('\n').filter(Boolean);
         msg = lines.pop()?.replace('ERROR: ', '') || msg;
       }
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
