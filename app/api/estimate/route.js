import { NextResponse } from 'next/server';
import { parseSpotifyUrl, getPlaylistTracks, getAlbumTracks, estimateSize } from '@/lib/spotify';

/**
 * POST /api/estimate
 * Body: { url: string, quality: number }
 * Returns: { trackCount, estimatedMb }
 */
export async function POST(request) {
  try {
    const { url, quality = 192 } = await request.json();
    const parsed = parseSpotifyUrl(url);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid Spotify URL' }, { status: 400 });
    }

    if (parsed.type === 'track') {
      return NextResponse.json({ trackCount: 1, estimatedMb: estimateSize(1, quality) });
    }

    let trackCount;
    if (parsed.type === 'playlist') {
      const data = await getPlaylistTracks(parsed.id);
      trackCount = data.tracks.length;
    } else {
      const data = await getAlbumTracks(parsed.id);
      trackCount = data.tracks.length;
    }

    return NextResponse.json({ trackCount, estimatedMb: estimateSize(trackCount, quality) });
  } catch (err) {
    const isPrivate = err.response?.status === 403 || err.response?.status === 401;
    return NextResponse.json(
      { error: isPrivate ? 'This playlist is private. Please use a public playlist.' : err.message },
      { status: isPrivate ? 403 : 500 }
    );
  }
}
