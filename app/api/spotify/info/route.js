import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/spotify/info?url=...
 * Fetches Spotify track/playlist metadata.
 * Uses the public Spotify embed page to scrape track info (no auth needed).
 * Falls back to Spotify Web API (metadata only) for cover/title.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url || !url.includes('spotify.com')) {
    return NextResponse.json({ error: 'Valid Spotify URL required' }, { status: 400 });
  }

  try {
    const idMatch = url.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    const itemType = idMatch?.[1];
    const itemId   = idMatch?.[2];

    if (!itemId || !itemType) {
      return NextResponse.json({ error: 'Could not parse Spotify URL' }, { status: 400 });
    }

    // Primary: scrape the embed page — no auth needed, works for public content
    const embedResult = await scrapeEmbed(itemType, itemId);
    if (embedResult && embedResult.items && embedResult.items.length > 0) {
      return NextResponse.json(embedResult);
    }

    // Fallback: try Spotify API (metadata only — tracks are 403 without user token)
    const token = await getSpotifyToken();
    if (token) {
      const meta = await fetchMetaFromAPI(token, itemType, itemId);
      if (meta) return NextResponse.json(meta);
    }

    return NextResponse.json({ 
      error: 'Could not fetch tracks. Make sure the playlist/track is public.' 
    }, { status: 500 });

  } catch (err) {
    console.error('Spotify info error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch Spotify info: ' + err.message }, { status: 500 });
  }
}

/**
 * Scrape Spotify embed page for track data.
 * The embed page embeds __NEXT_DATA__ JSON with full entity data.
 */
async function scrapeEmbed(type, id) {
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) {
      console.error('Embed fetch failed:', res.status, res.statusText);
      return null;
    }

    const html = await res.text();

    // Extract __NEXT_DATA__ JSON blob
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) {
      console.error('__NEXT_DATA__ not found in embed page');
      return null;
    }

    const nextData = JSON.parse(match[1]);
    const entity = nextData?.props?.pageProps?.state?.data?.entity;

    if (!entity) {
      console.error('Entity not found in __NEXT_DATA__');
      return null;
    }

    if (type === 'track') {
      return {
        title: entity.name || 'Unknown Track',
        thumbnail: entity.coverArt?.sources?.[0]?.url || null,
        duration: Math.round((entity.duration?.totalMilliseconds || 0) / 1000),
        isPlaylist: false,
        items: [{
          id,
          title: entity.name || 'Unknown Track',
          artist: entity.artists?.items?.map(a => a.profile?.name).join(', ') || '',
          album: entity.albumOfTrack?.name || '',
          thumbnail: entity.coverArt?.sources?.[0]?.url || null,
          duration: Math.round((entity.duration?.totalMilliseconds || 0) / 1000),
        }]
      };
    }

    // Playlist or Album
    const trackList = entity.trackList || [];
    const coverUrl = entity.coverArt?.sources?.[0]?.url
      || entity.images?.[0]?.url
      || null;

    const items = trackList.map((t, i) => ({
      id: t.uid || `${id}_${i}`,
      title: t.title || `Track ${i + 1}`,
      artist: t.subtitle || '',
      album: type === 'album' ? entity.name : (t.album?.name || ''),
      thumbnail: t.album?.coverArt?.sources?.[0]?.url || coverUrl || null,
      duration: Math.round((t.duration?.totalMilliseconds || 0) / 1000),
    }));

    return {
      title: entity.name || 'Playlist',
      thumbnail: coverUrl,
      isPlaylist: true,
      items,
    };

  } catch (err) {
    console.error('Embed scrape error:', err.message);
    return null;
  }
}

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch { return null; }
}

async function fetchMetaFromAPI(token, type, id) {
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const res = await fetch(`https://api.spotify.com/v1/${type === 'track' ? 'tracks' : type === 'album' ? 'albums' : 'playlists'}/${id}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.name || 'Unknown',
      thumbnail: data.images?.[0]?.url || data.album?.images?.[0]?.url || null,
      isPlaylist: type !== 'track',
      items: [],
    };
  } catch { return null; }
}
