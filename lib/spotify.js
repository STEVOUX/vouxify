'use strict';

/**
 * lib/spotify.js — Spotify Web API client.
 * Uses Client Credentials flow (no user login required).
 * Caches responses for 10 minutes to reduce API calls.
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const CACHE_TTL = 600;
const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 120 });

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry - 30000) return accessToken;

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  }

  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + response.data.expires_in * 1000;
  return accessToken;
}

async function spotifyGet(endpoint) {
  const token = await getAccessToken();
  const response = await axios.get(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  return response.data;
}

function extractId(url, type) {
  const patterns = {
    track:    /spotify\.com\/track\/([A-Za-z0-9]+)/,
    playlist: /spotify\.com\/playlist\/([A-Za-z0-9]+)/,
    album:    /spotify\.com\/album\/([A-Za-z0-9]+)/,
  };
  const match = url.match(patterns[type]);
  return match ? match[1] : null;
}

function getBestImage(images) {
  if (!images || !images.length) return null;
  return (images.find(i => i.width >= 600) || images[0]).url;
}

async function getTrackMetadata(trackId) {
  const cacheKey = `track:${trackId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const data = await spotifyGet(`/tracks/${trackId}`);
  const meta = {
    id:          data.id,
    title:       data.name,
    artist:      data.artists.map(a => a.name).join(', '),
    album:       data.album.name,
    year:        data.album.release_date?.substring(0, 4) || '',
    trackNumber: data.track_number,
    durationMs:  data.duration_ms,
    artworkUrl:  getBestImage(data.album.images),
  };
  cache.set(cacheKey, meta);
  return meta;
}

async function getPlaylistTracks(playlistId) {
  const cacheKey = `playlist:${playlistId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let playlistName, artworkUrl;
  const tracks = [];
  let useFallback = false;

  try {
    const playlistData = await spotifyGet(`/playlists/${playlistId}`);
    playlistName = playlistData.name;
    artworkUrl = getBestImage(playlistData.images);

    let offset = 0;
    const limit = 100;

    while (true) {
      const data = await spotifyGet(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
      for (const item of data.items) {
        if (!item.track || !item.track.id) continue;
        const t = item.track;
        tracks.push({
          id:          t.id,
          title:       t.name,
          artist:      t.artists.map(a => a.name).join(', '),
          album:       t.album?.name || playlistName,
          year:        t.album?.release_date?.substring(0, 4) || '',
          trackNumber: tracks.length + 1,
          durationMs:  t.duration_ms,
          artworkUrl:  getBestImage(t.album?.images) || artworkUrl,
        });
      }
      offset += limit;
      if (!data.next) break;
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 404 || status === 403 || status === 401) {
      useFallback = true;
    } else {
      throw err;
    }
  }

  // Fallback to scraping if the official API blocks us
  if (useFallback) {
    try {
      const spotify = require('spotify-url-info')(fetch);
      const data = await spotify.getData(`https://open.spotify.com/playlist/${playlistId}`);
      
      playlistName = data.name || 'Unknown Playlist';
      artworkUrl = data.coverArt?.sources?.[0]?.url || null;

      if (!data.trackList || !data.trackList.length) {
        throw new Error('Playlist has no playable tracks.');
      }

      for (const item of data.trackList) {
        if (!item.uri || !item.uri.includes(':track:')) continue;
        
        // Handle non-breaking spaces in subtitle
        const artistStr = (item.subtitle || 'Unknown Artist').replace(/\u00A0/g, ' ');

        tracks.push({
          id:          item.uri.split(':').pop(),
          title:       item.title,
          artist:      artistStr,
          album:       playlistName,
          year:        '', // Scraping doesn't easily provide track year
          trackNumber: tracks.length + 1,
          durationMs:  item.duration,
          artworkUrl:  artworkUrl,
        });
      }
    } catch (scrapeErr) {
      throw new Error('Playlist not found or private. Check the URL or try a different playlist.');
    }
  }

  const result = { name: playlistName, artworkUrl, tracks };
  cache.set(cacheKey, result);
  return result;
}

async function getAlbumTracks(albumId) {
  const cacheKey = `album:${albumId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let albumName, year, artworkUrl, artist;
  const tracks = [];
  let useFallback = false;

  try {
    const albumData = await spotifyGet(`/albums/${albumId}`);
    albumName = albumData.name;
    year = albumData.release_date?.substring(0, 4) || '';
    artworkUrl = getBestImage(albumData.images);
    artist = albumData.artists.map(a => a.name).join(', ');

    albumData.tracks.items.forEach((t, i) => {
      tracks.push({
        id:          t.id,
        title:       t.name,
        artist:      t.artists.map(a => a.name).join(', ') || artist,
        album:       albumName,
        year,
        trackNumber: t.track_number || i + 1,
        durationMs:  t.duration_ms,
        artworkUrl,
      });
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 404 || status === 403 || status === 401) {
      useFallback = true;
    } else {
      throw err;
    }
  }

  if (useFallback) {
    try {
      const spotify = require('spotify-url-info')(fetch);
      const data = await spotify.getData(`https://open.spotify.com/album/${albumId}`);
      
      albumName = data.name || 'Unknown Album';
      artworkUrl = data.coverArt?.sources?.[0]?.url || null;
      year = data.date?.substring(0, 4) || '';
      artist = data.subtitle || 'Unknown Artist';

      if (!data.trackList || !data.trackList.length) {
        throw new Error('Album has no playable tracks.');
      }

      for (const item of data.trackList) {
        if (!item.uri || !item.uri.includes(':track:')) continue;
        
        const trackArtistStr = (item.subtitle || artist).replace(/\u00A0/g, ' ');

        tracks.push({
          id:          item.uri.split(':').pop(),
          title:       item.title,
          artist:      trackArtistStr,
          album:       albumName,
          year:        year,
          trackNumber: tracks.length + 1,
          durationMs:  item.duration,
          artworkUrl:  artworkUrl,
        });
      }
    } catch (scrapeErr) {
      throw new Error('Album not found or private. Check the URL or try a different album.');
    }
  }

  const result = { name: albumName, artworkUrl, tracks };
  cache.set(cacheKey, result);
  return result;
}

function estimateSize(trackCount, quality) {
  const avgMbPerTrack = { 128: 3.5, 192: 5.2, 320: 8.7 };
  return Math.round(trackCount * (avgMbPerTrack[quality] || 5.2));
}

function parseSpotifyUrl(url) {
  if (!url) return null;
  for (const type of ['track', 'playlist', 'album']) {
    const id = extractId(url, type);
    if (id) return { type, id };
  }
  return null;
}

module.exports = { getTrackMetadata, getPlaylistTracks, getAlbumTracks, estimateSize, parseSpotifyUrl };
