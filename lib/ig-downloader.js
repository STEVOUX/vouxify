        const slide      = slides[Math.min(idx, slides.length - 1)];
        const candidates = (slide?.image_versions2?.candidates || []).sort((a, b) => b.width - a.width);
        if (candidates[0]?.url) return candidates[0].url;
      }
    }
  } catch {}

  // Strategy 2: og:image from main page (fallback for single image only)
  if (itemIndex !== 'all') {
    try {
      const slideUrl = (itemIndex && itemIndex > 1)
        ? `https://www.instagram.com/p/${sc}/?img_index=${itemIndex}`
        : `https://www.instagram.com/p/${sc}/`;
      const html = (await fetchUrl(slideUrl)).toString('utf8');
      const og = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) || [])[1];
      if (og) return og.replace(/&amp;/g, '&');
    } catch {}
  }

  return null;
}

// ── Common yt-dlp args factory ────────────────────────────────────────────
function buildArgs({ url, igFormat, igCategory, itemIndex, outTemplate }) {
  let formatArgs = [];
  if (igFormat === 'audio') {
    // Reel audio extraction
    formatArgs = ['-x', '--audio-format', 'mp3', '--audio-quality', '0'];
  } else if (igCategory === 'post') {
    // Posts (image or video carousel) — no format coercion, let yt-dlp pick native
    formatArgs = [];
  } else {
    // Reels / Stories / Highlights — merge streams into mp4
    formatArgs = ['--merge-output-format', 'mp4'];
  }

  const args = [
    url,
    '-o', outTemplate,
    '--ffmpeg-location', ffmpegPath,
    '--no-warnings',
    '--ignore-errors',        // don't abort on individual item errors
    ...formatArgs,
  ];

  // Specific carousel item: use --playlist-items (1-based)
  // NOTE: do NOT add --no-playlist here — it blocks carousel extraction
  if (itemIndex != null && itemIndex !== 'all') args.push('--playlist-items', String(itemIndex));

  const cookiesPath = path.join(process.cwd(), 'insta_cookies.txt');
  if (fs.existsSync(cookiesPath)) args.push('--cookies', cookiesPath);

  return args;
}

// ── Main export ─────────────────────────────────────────────────────────────
/**
 * @param {{ url, igFormat, igCategory, itemIndex }} opts
 */
async function downloadInstagramMedia({ url, igFormat, igCategory, itemIndex }, fileId, onProgress, signal) {
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // ── DP: profile picture — yt-dlp can't do this ───────────────────────────
  if (igCategory === 'dp') {
    onProgress(15, 'Fetching profile page...');

    const html = (await fetchUrl(url)).toString('utf8');

    onProgress(50, 'Extracting profile picture...');

    const match =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
      html.match(/profile_pic_url_hd":"([^"]+)"/i) ||
      html.match(/profile_pic_url":"([^"]+)"/i);

    if (!match) throw new Error('Could not find profile picture. Account may be private or Instagram blocked this request.');

    const imgUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');

    onProgress(70, 'Downloading profile picture...');
