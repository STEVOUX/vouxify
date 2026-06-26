'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Carousel from './components/Carousel';
import PlaylistView from './components/PlaylistView';

/* ─────────────────────────────────────────────────────────────
   Official SVG icons for each platform
───────────────────────────────────────────────────────────── */
const ICONS = {
  youtube: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  spotify: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
    </svg>
  ),
  audio: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  )
};

/* ── Platform config ─────────────────────────────────────────── */
const PLATFORMS = [
  { id: 'spotify',   label: 'Spotify',   color: '#1DB954', match: ['spotify.com', 'open.spotify.com'],
    heroTitle: 'Download Spotify', heroSub: 'Tracks & Playlists', 
    heroDesc: 'High-quality MP3 downloads with full metadata, album art, and ZIP packaging for playlists. Instantly.' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000', match: ['youtube.com', 'youtu.be'],
    heroTitle: 'Download Anything,', heroSub: 'Instantly.', 
    heroDesc: 'YouTube, Spotify, Instagram, TikTok & more. Free, fast, no watermarks.' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C', match: ['instagram.com'],
    heroTitle: 'Download Instagram', heroSub: 'Posts, Reels & Stories', 
    heroDesc: 'Download Instagram posts, reels, stories, highlights, and profile pictures in high quality.',
    heroGradient: 'linear-gradient(90deg, #833ab4, #fd1d1d, #fcb045)' },
  { id: 'tiktok',    label: 'TikTok',    color: '#00F2FE', match: ['tiktok.com', 'vm.tiktok.com'],
    heroTitle: 'Download TikTok', heroSub: 'Videos & Audio', 
    heroDesc: 'Download TikTok videos without watermarks or extract high-quality audio.',
    heroGradient: 'linear-gradient(90deg, #FE2C55, #00F2FE)' },
  { id: 'twitter',   label: 'X (Twitter)', color: '#FFFFFF', match: ['twitter.com', 'x.com'],
    heroTitle: 'Download from X', heroSub: '', 
    heroDesc: 'Download high-quality videos and GIFs from X instantly.' },
];

const PLACEHOLDER = {
  youtube:   'Paste a YouTube URL (youtu.be/... or youtube.com/watch?v=...)',
  spotify:   'Paste Spotify track URL... (e.g. open.spotify.com/track/...)',
  instagram: 'e.g. https://www.instagram.com/reel/ABC123/',
  tiktok:    'Paste TikTok video URL...',
  twitter:   'Paste X URL...',
};

/* ── URL helpers ─────────────────────────────────────────────── */
const SP_QUALITIES = [
  { id: '320', label: '320 kbps', tag: 'Best Quality', tagColor: '#a855f7', speed: 'Slowest', speedColor: '#ef4444', sizePerMin: 2.4, desc: 'Lossless-like · Studio quality' },
  { id: '256', label: '256 kbps', tag: 'High Quality', tagColor: '#3b82f6', speed: 'Slow',    speedColor: '#f97316', sizePerMin: 1.9, desc: 'Near-lossless · Audiophile' },
  { id: '192', label: '192 kbps', tag: 'Balanced',     tagColor: '#1DB954', speed: 'Medium',  speedColor: '#eab308', sizePerMin: 1.4, desc: 'Great quality · Recommended' },
  { id: '128', label: '128 kbps', tag: 'Standard',     tagColor: '#64748b', speed: 'Fast',    speedColor: '#22c55e', sizePerMin: 1.0, desc: 'Good quality · Fastest' },
  { id: '96',  label: '96 kbps',  tag: 'Economy',      tagColor: '#374151', speed: 'Fastest', speedColor: '#10b981', sizePerMin: 0.7, desc: 'Smaller files · Data saving' },
];

/* ── URL helpers ─────────────────────────────────────────────── */
function detectPlatform(url) {
  if (!url) return null;
  for (const p of PLATFORMS) {
    if (p.match.some(m => url.includes(m))) return p.id;
  }
  return null;
}

function validateUrl(url, platform) {
  if (!url || !url.trim()) return 'Please paste a URL first.';
  try { new URL(url); } catch { return 'That doesn\'t look like a valid URL.'; }
  const detected = detectPlatform(url);
  if (!detected) return 'URL not supported. Supported: YouTube, Spotify, Instagram, TikTok, X.';
  if (detected !== platform) {
    const name = PLATFORMS.find(p => p.id === detected)?.label || detected;
    return `This looks like a ${name} URL. Switch to ${name} tab or paste the correct URL.`;
  }
  return null;
}

/* ── Main component ──────────────────────────────────────────── */
export default function Home() {
  const [url, setUrl]           = useState('');
  const [platform, setPlatform] = useState('youtube');
  
  // Format state options
  const [format, setFormat]     = useState('video');
  const [quality, setQuality]   = useState('');
  
  // Platform specific sub-options
  const [spMode, setSpMode]     = useState('mp3'); // mp3 | playlist
  const [igType, setIgType]     = useState('reels'); // reels | post | story | highlights | dp
  
  const [status, setStatus]     = useState('idle');   // idle | loading | processing | complete | error
  const [progress, setProgress] = useState(0);
  const [message, setMessage]   = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [urlError, setUrlError] = useState('');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [mediaInfo, setMediaInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [selectedIndices, setSelectedIndices] = useState([]);

  const esRef    = useRef(null);
  const abortRef = useRef(null);
  const pollRef = useRef(null);
  const watchdogRef = useRef(null);
  const infoAbortRef = useRef(null);
  const infoTimeoutRef = useRef(null);

  const activePlatform = PLATFORMS.find(p => p.id === platform) || PLATFORMS[1];

  // Custom dropdown states
  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const [isQualityOpen, setIsQualityOpen] = useState(false);
  const [isSpQualityOpen, setIsSpQualityOpen] = useState(false);
  const [spDropRect, setSpDropRect] = useState(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.custom-select') && !event.target.closest('.modal-content') && !event.target.closest('#sp-quality-trigger')) {
        setIsFormatOpen(false);
        setIsQualityOpen(false);
        setIsSpQualityOpen(false);
        setSpDropRect(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* ── State Persistence ──────────────────────────────────────── */
  useEffect(() => {
    const savedPlatform = localStorage.getItem('vouxify_platform');
    const savedFormat = localStorage.getItem('vouxify_format');
    if (savedPlatform) setPlatform(savedPlatform);
    if (savedFormat) setFormat(savedFormat);
  }, []);

  useEffect(() => {
    localStorage.setItem('vouxify_platform', platform);
  }, [platform]);

  useEffect(() => {
    localStorage.setItem('vouxify_format', format);
  }, [format]);

  /* ── Theme ──────────────────────────────────────────────────── */
  useEffect(() => { document.body.className = `theme-${platform}`; }, [platform]);

  /* ── Auto-detect platform ───────────────────────────────────── */
  useEffect(() => {
    const detected = detectPlatform(url);
    if (detected && detected !== platform) {
      setPlatform(detected);
      setFormat('video');
      setMediaInfo(null);
    }
    
    if (detected === 'instagram' && url) {
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.includes('/reel/')) {
        setIgType('reels');
      } else if (lowerUrl.includes('/p/')) {
        setIgType('post');
      } else if (lowerUrl.includes('/highlights/')) {
        setIgType('highlights');
      } else if (lowerUrl.includes('/stories/')) {
        setIgType('story');
      } else if (!lowerUrl.includes('/reel/') && !lowerUrl.includes('/p/') && !lowerUrl.includes('/stories/') && !lowerUrl.includes('/tv/')) {
        // If it has none of the standard media paths, it's likely a profile URL
        if (lowerUrl.match(/instagram\.com\/[a-zA-Z0-9_.]+\/?(\?.*)?$/)) {
          setIgType('dp');
        }
      }
    }

    if (url) setUrlError('');
  }, [url, platform]);

  useEffect(() => {
    if (!url || status !== 'idle') { 
      setMediaInfo(null); 
      setInfoLoading(false);
      return; 
    }
    const detected = detectPlatform(url);
    if (!detected || detected !== platform) return;

    if (infoAbortRef.current) infoAbortRef.current.abort();
    infoAbortRef.current = new AbortController();

    if (infoTimeoutRef.current) clearTimeout(infoTimeoutRef.current);
    infoTimeoutRef.current = setTimeout(async () => {
      setInfoLoading(true);
      try {
        // Use dedicated Spotify info API to avoid DRM errors from yt-dlp
        const infoUrl = platform === 'spotify'
          ? `/api/spotify/info?url=${encodeURIComponent(url)}`
          : `/api/info?url=${encodeURIComponent(url)}`;

        const r = await fetch(infoUrl, { signal: infoAbortRef.current.signal });
        if (r.ok) {
          const d = await r.json();
          if (!d.error) {
            setMediaInfo(d);
            
            // Auto-select highest quality option
            if (format === 'video' && d.formats && d.formats.video && d.formats.video.length > 0) {
              setQuality(d.formats.video[0].format_id);
            } else if (format === 'audio' && d.formats && d.formats.audio && d.formats.audio.length > 0) {
              setQuality(d.formats.audio[0].format_id);
            }

            if (d.isPlaylist && d.items) {
              setSelectedIndices(d.items.map((_, i) => i + 1));
            } else if (d.items && d.items.length > 0) {
              // Single track still has items array
              setSelectedIndices([1]);
            } else {
              setSelectedIndices([]);
            }
          } else {
            setUrlError(d.error);
            console.warn('Info fetch error:', d.error);
          }
        } else {
          const errData = await r.json().catch(() => ({}));
          setUrlError(errData.error || 'Failed to fetch media information.');
        }
      } catch (e) { 
        if (e.name !== 'AbortError') {
          console.error('Info fetch failed:', e);
        }
      }
      setInfoLoading(false);
    }, 300);
    return () => clearTimeout(infoTimeoutRef.current);
  }, [url, platform, status]);

  /* ── Cleanup ────────────────────────────────────────────────── */
  const cleanup = useCallback(() => {
    if (esRef.current)       { esRef.current.close(); esRef.current = null; }
    if (abortRef.current)    { abortRef.current.abort(); abortRef.current = null; }
    if (pollRef.current)     { clearInterval(pollRef.current); pollRef.current = null; }
    if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }
  }, []);
  useEffect(() => () => cleanup(), []);

  // Auto-set format to video for posts/dp to avoid sending 'audio' to yt-dlp mistakenly
  let activeFormat = format;
  if (activePlatform.id === 'instagram' && !['reels', 'story'].includes(igType)) {
    activeFormat = 'video'; // default
  }

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const err = validateUrl(url, platform);
    if (err) return setUrlError(err);
    setUrlError('');
    setStatus('loading');
    setProgress(5);
    setMessage('Processing your request...');
    setErrorMsg('');
    setDownloadUrl('');

    try {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const reqBody = { 
        url: url.trim(), format: activeFormat, quality, platform, spMode, igType,
        ...(platform === 'spotify' && mediaInfo?.items ? {
          selectedIndices: selectedIndices.length > 0 ? selectedIndices : [1],
          playlistTitle: mediaInfo.title || null,
          spotifyQueries: (selectedIndices.length > 0 ? selectedIndices : [1]).map(idx => {
            const item = mediaInfo.items[idx - 1];
            if (!item) return null;
            const artist = item.artist || item.uploader || item.creator || '';
            return `ytsearch1:${artist} ${item.title} audio`;
          }).filter(Boolean)
        } : mediaInfo?.isPlaylist && selectedIndices?.length > 0 ? { 
          selectedIndices,
          playlistTitle: mediaInfo.title || null,
          spotifyQueries: undefined
        } : {})
      };

    const apiMap = {
      youtube:   '/api/download/youtube',
      spotify:   '/api/download/single',
      instagram: '/api/download/instagram',
      tiktok:    '/api/download/tiktok',
      twitter:   '/api/download/twitter',
    };

    const res = await fetch(apiMap[platform] || '/api/download/' + platform, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data.error || `Server error (${res.status})`);
        return;
      }

      if (data.jobId) {
        setStatus('processing');
        setProgress(8);
        setMessage('Starting download process...');
        startSSE(data.jobId);
      } else {
        setStatus('error');
        setErrorMsg('No job ID returned from server.');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus('error');
      setErrorMsg(err.message || 'Network error — please try again.');
    }
  };

  /* ── SSE listener with polling fallback ─────────────────────── */
  const startSSE = (jobId) => {
    const es = new EventSource(`/api/job/${jobId}/stream`);
    esRef.current = es;

    let lastUpdate = Date.now();

    es.onmessage = (event) => {
      lastUpdate = Date.now();
      try {
        const d = JSON.parse(event.data);
        if (d.progress != null && d.progress >= 0) setProgress(Math.max(3, d.progress));
        if (d.message) setMessage(d.message);

        if (d.status === 'completed') {
          setProgress(100);
          setStatus('complete');
          setMessage(d.message || 'Download is ready!');
          if (d.result) setDownloadUrl(d.result);
          cleanup();
          if (d.result) triggerDownloadLink(d.result);
        } else if (d.status === 'failed') {
          setStatus('error');
          // Include any partial info in the error message
          const failMsg = d.error || d.message || 'Download failed. Please try again.';
          setErrorMsg(failMsg);
          cleanup();
        } else if (d.status === 'partial') {
          // Some tracks downloaded, some failed
          setProgress(100);
          setStatus('complete');
          setMessage(d.message || 'Partial download complete');
          if (d.result) setDownloadUrl(d.result);
          cleanup();
          if (d.result) triggerDownloadLink(d.result);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      if (esRef.current) {
        es.close();
        esRef.current = null;
        startPolling(jobId);
      }
    };

    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = setInterval(() => {
      if (Date.now() - lastUpdate > 8000 && esRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
        es.close();
        esRef.current = null;
        startPolling(jobId);
      }
    }, 3000);
  };

  const startPolling = (jobId) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 120) {
        cleanup();
        setStatus('error');
        setErrorMsg('Download timed out. Please try again.');
        return;
      }
      try {
        const r = await fetch(`/api/job/${jobId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.progress != null && d.progress >= 0) setProgress(Math.max(3, d.progress));
        if (d.message) setMessage(d.message);

        if (d.status === 'completed') {
          setProgress(100);
          setStatus('complete');
          setMessage('Download is ready!');
          const dlUrl = `/api/job/${jobId}/download`;
          setDownloadUrl(dlUrl);
          cleanup();
          triggerDownloadLink(dlUrl);
        } else if (d.status === 'failed') {
          setStatus('error');
          setErrorMsg(d.error || 'Download failed.');
          cleanup();
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  function triggerDownloadLink(href) {
    const a = Object.assign(document.createElement('a'), { href, download: '', target: '_blank' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 500);
  }

  const handleCancel = () => {
    cleanup();
    setStatus('idle');
    setProgress(0);
    setMessage('');
    setErrorMsg('');
    setDownloadUrl('');
  };

  const isActive = status === 'loading' || status === 'processing';

  /* ── Render Platform Specific Options ───────────────────────── */
  const renderYouTubeOptions = () => {
    
    if (!mediaInfo || !mediaInfo.formats) {
      return null;
    }

    const { video, audio } = mediaInfo.formats;
    const isAudio = format === 'audio';
    const list = isAudio ? audio : video;
    
    // Sort quality options: highest resolution/bitrate first, and move 'best' to top
    // The backend `yt-dlp` returns formats, let's reverse them to put 4K at top if not already sorted.
    const sortedList = [...list].reverse(); 
    
    const selectedFormatLabel = isAudio ? 'Audio (MP3)' : 'Video (MP4)';
    const selectedQualityItem = sortedList.find(f => String(f.format_id) === String(quality));
    const selectedQualityLabel = selectedQualityItem 
      ? `${selectedQualityItem.quality} ${selectedQualityItem.sizeStr ? `• ${selectedQualityItem.sizeStr}` : ''}` 
      : (sortedList[0] ? `${sortedList[0].quality} ${sortedList[0].sizeStr ? `• ${sortedList[0].sizeStr}` : ''}` : 'Select Quality');

    return (
      <div className="options-row options-fade-in" style={{ marginBottom: '10px' }}>
        <div className="option-group" style={{ width: '100%' }}>
          <label className="option-label" id="quality-label">Select Quality & Size</label>
          <div className={`custom-select ${isActive ? 'disabled' : ''}`}>
            <div 
              className="custom-select-trigger" 
              onClick={() => !isActive && setIsQualityOpen(true)}
              aria-labelledby="quality-label"
            >
              <span>{selectedQualityLabel}</span>
              <span className="arrow">▼</span>
            </div>
            
          </div>
        </div>
      </div>
    );
  };

  const renderQualityModal = () => {
    if (!isQualityOpen || !mediaInfo || !mediaInfo.formats) return null;
    const { video, audio } = mediaInfo.formats;
    const list = format === 'audio' ? audio : video;
    const sortedList = [...list].reverse(); 

    return (
      <div className="modal-overlay" onClick={() => setIsQualityOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Select Quality & Size</h3>
            <button type="button" className="modal-close" onClick={() => setIsQualityOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            {sortedList.map((f, i) => (
              <div key={f.format_id || i} 
                className={`custom-option ${String(quality) === String(f.format_id) ? 'selected' : ''}`}
                onClick={() => { setQuality(f.format_id); setIsQualityOpen(false); }}>
                {f.quality} {f.sizeStr ? <span className="size-badge">{f.sizeStr}</span> : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };


  const renderSpotifyOptions = () => {

    const sel = SP_QUALITIES.find(q => q.id === quality) || SP_QUALITIES[2];
    const sizePerTrack = (sel.sizePerMin * 3.5).toFixed(1);
    const totalTracks = selectedIndices.length || 1;
    const totalMB = (sel.sizePerMin * 3.5 * totalTracks).toFixed(0);

    return (
      <div className="segmented-options">
        {/* MP3 / Playlist toggle */}
        <div className="segmented-control">
          <button type="button" className={`seg-btn ${spMode === 'mp3' ? 'active' : ''}`} onClick={() => setSpMode('mp3')}>
            <span className="seg-icon">{ICONS.audio}</span> MP3 Mode
          </button>
          <button type="button" className={`seg-btn ${spMode === 'playlist' ? 'active' : ''}`} onClick={() => setSpMode('playlist')}>
            <span className="seg-icon">{ICONS.folder}</span> Playlist Mode
          </button>
        </div>

        {/* Compact Quality Dropdown — in-flow so URL field sits below */}
        <div style={{ marginTop: '14px' }}>
          {/* Trigger row */}
          <div
            id="sp-quality-trigger"
            onClick={() => setIsSpQualityOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '11px 16px', borderRadius: isSpQualityOpen ? '10px 10px 0 0' : '10px',
              cursor: 'pointer', background: '#1a1a2a',
              border: `1.5px solid ${isSpQualityOpen ? sel.tagColor : 'rgba(255,255,255,0.18)'}`,
              borderBottom: isSpQualityOpen ? `1.5px solid ${sel.tagColor}40` : undefined,
              transition: 'all 0.15s',
              boxShadow: isSpQualityOpen ? `0 0 0 3px ${sel.tagColor}20` : 'none',
              userSelect: 'none',
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: sel.tagColor, flexShrink: 0, boxShadow: `0 0 7px ${sel.tagColor}` }} />
            <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#fff' }}>{sel.label}</span>
            <span style={{ fontSize: '0.76rem', color: sel.tagColor, fontWeight: '700' }}>{sel.tag}</span>
            <span style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: `${sel.speedColor}30`, border: `1px solid ${sel.speedColor}60`,
              borderRadius: '5px', padding: '2px 9px',
            }}>
              <span style={{ fontSize: '0.62rem', color: sel.speedColor }}>●</span>
              <span style={{ fontSize: '0.72rem', fontWeight: '800', color: sel.speedColor }}>{sel.speed}</span>
            </span>
            <span style={{ fontSize: '0.73rem', color: '#999', flexShrink: 0 }}>
              ~{sizePerTrack} MB{totalTracks > 1 ? ` · ~${totalMB} MB total` : ''}
            </span>
            <span style={{ fontSize: '0.65rem', color: '#777', transition: 'transform 0.2s', transform: isSpQualityOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>▼</span>
          </div>

          {/* Dropdown list — in normal flow, pushes URL field down */}
          {isSpQualityOpen && (
            <div style={{
              background: '#12121e',
              border: `1.5px solid ${sel.tagColor}`,
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              overflow: 'hidden',
              boxShadow: `0 16px 40px rgba(0,0,0,0.85), 0 0 0 3px ${sel.tagColor}15`,
              marginBottom: '14px',
            }}>
              {SP_QUALITIES.map((q, i) => {
                const isActive = quality === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => { setQuality(q.id); setIsSpQualityOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 16px', cursor: 'pointer',
                      background: isActive ? `${q.tagColor}18` : 'transparent',
                      borderBottom: i < SP_QUALITIES.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = isActive ? `${q.tagColor}18` : 'transparent'; }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: q.tagColor, flexShrink: 0, boxShadow: `0 0 6px ${q.tagColor}` }} />
                    <span style={{ fontWeight: '800', fontSize: '0.9rem', color: isActive ? q.tagColor : '#fff', minWidth: '76px' }}>{q.label}</span>
                    <span style={{ fontSize: '0.76rem', color: isActive ? q.tagColor : '#aaa', fontWeight: '600', flex: 1 }}>{q.tag} · {q.desc}</span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      background: `${q.speedColor}28`, border: `1px solid ${q.speedColor}50`,
                      borderRadius: '4px', padding: '2px 8px',
                    }}>
                      <span style={{ fontSize: '0.58rem', color: q.speedColor }}>●</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', color: q.speedColor }}>{q.speed}</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#666', flexShrink: 0 }}>~{(q.sizePerMin * 3.5).toFixed(1)} MB</span>
                    {isActive && <span style={{ fontSize: '0.9rem', color: q.tagColor }}>✓</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  };



  const renderInstagramOptions = () => (
    <div className="segmented-options">
      <div className="segmented-control" style={{ marginBottom: '10px' }}>
        {['reels', 'post', 'story', 'highlights', 'dp'].map(t => (
          <button key={t} type="button" className={`seg-btn ${igType === t ? 'active' : ''}`} onClick={() => { 
            setIgType(t);
            setUrl('');
            setUrlError('');
            setStatus('idle');
            setDownloadUrl('');
            setProgress(0);
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {(igType === 'reels' || igType === 'story') && (
        <div className="segmented-control" style={{ marginBottom: '16px' }}>
          <button type="button" className={`seg-btn ${format === 'video' ? 'active' : ''}`} onClick={() => setFormat('video')}>
            <span className="seg-icon">{ICONS.video}</span> {igType === 'reels' ? 'Reel (Video)' : 'Video'}
          </button>
          <button type="button" className={`seg-btn ${format === 'audio' ? 'active' : ''}`} onClick={() => setFormat('audio')}>
            <span className="seg-icon">{ICONS.audio}</span> {igType === 'reels' ? 'Reel (Audio)' : 'Audio'}
          </button>
        </div>
      )}
    </div>
  );

  const renderBasicFormatOptions = () => (
    <div className="segmented-options">
      <div className="segmented-control" style={{ marginBottom: '16px' }}>
        <button
          type="button"
          className={`seg-btn ${format === 'video' ? 'active' : ''}`}
          onClick={() => { setFormat('video'); setQuality('best'); setStatus('idle'); setDownloadUrl(''); setProgress(0); }}
        >
          <span className="seg-icon">{ICONS.video}</span> MP4 (Video)
        </button>
        <button
          type="button"
          className={`seg-btn ${format === 'audio' ? 'active' : ''}`}
          onClick={() => { setFormat('audio'); setQuality('320'); setStatus('idle'); setDownloadUrl(''); setProgress(0); }}
        >
          <span className="seg-icon">{ICONS.audio}</span> MP3 (Audio)
        </button>
      </div>
    </div>
  );

  const renderMobileSidebar = () => {
    if (!isSidebarOpen) return null;
    return (
      <>
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
        <div className="mobile-sidebar">
          <div style={{ textAlign: 'center', marginBottom: '40px', marginTop: '20px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '4px', color: 'var(--text)' }}>
              VOUXIFY
            </span>
          </div>
          <nav role="navigation" aria-label="Mobile Platform Navigation" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                className={`platform-tab ${platform === p.id ? 'active' : ''}`}
                onClick={() => {
                  setPlatform(p.id);
                  setFormat('video');
                  setMediaInfo(null);
                  setStatus('idle');
                  setDownloadUrl('');
                  setProgress(0);
                  setUrl('');
                  setUrlError('');
                  setIsSidebarOpen(false);
                }}
                style={platform === p.id ? { '--tab-color': p.color, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '24px' } : { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '24px' }}
              >
                <span className="platform-tab-icon" style={{ color: platform === p.id ? p.color : 'inherit', marginRight: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
                  {ICONS[p.id]}
                </span>
                <span style={{ fontWeight: '500' }}>{p.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </>
    );
  };

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <>
      <div className="bg-orbs" aria-hidden="true">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
      </div>

      <div className="app">
        {renderMobileSidebar()}
        <header className="header" role="banner" style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', padding: '24px 24px 0' }}>
          <div className="logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="https://res.cloudinary.com/dyiztuod3/image/upload/v1781714384/logo_jewy2p.png" 
              alt="VOUXIFY Logo" 
              className="logo-icon"
              loading="eager"
            />
          </div>
          <button 
            className="hamburger-btn" 
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open Menu"
          >
            ☰
          </button>
        </header>

        <main className="container">
          {/* ── Dynamic Hero ── */}
          <section className="hero" aria-label="Hero">
            <h1 className="hero-title">
              {activePlatform.id === 'youtube' ? (
                <>Download <span className="accent">Anything</span>,<br/>Instantly.</>
              ) : (
                <>
                  {activePlatform.heroTitle}
                  {activePlatform.heroSub && <><br/><span className="accent" style={activePlatform.heroGradient ? {
                    backgroundImage: activePlatform.heroGradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    color: 'transparent',
                    display: 'inline-block'
                  } : {}}>{activePlatform.heroSub}</span></>}
                </>
              )}
            </h1>
            <p className="hero-sub">{activePlatform.heroDesc}</p>
          </section>

          {/* ── Platform tabs ── */}
          <nav className="platform-tabs" role="tablist" aria-label="Platform">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                role="tab"
                aria-selected={platform === p.id}
                className={`platform-tab ${platform === p.id ? 'active' : ''}`}
                onClick={() => {
                  setPlatform(p.id);
                  setFormat('video');
                  setMediaInfo(null);
                  setStatus('idle');
                  setDownloadUrl('');
                  setProgress(0);
                  setUrl('');
                  setUrlError('');
                }}
                style={platform === p.id ? { '--tab-color': p.color } : {}}
              >
                <span className="platform-tab-icon" aria-hidden="true"
                  style={{ color: platform === p.id ? p.color : 'inherit' }}>
                  {ICONS[p.id]}
                </span>
                {p.label}
              </button>
            ))}
          </nav>

          {/* ── Main Input Card ── */}
          <div className="card">
            <form onSubmit={handleSubmit} noValidate>
              
              {/* Top Options Panels */}
              {platform === 'spotify' && renderSpotifyOptions()}
              {platform === 'instagram' && renderInstagramOptions()}
              {(platform === 'youtube' || platform === 'tiktok' || platform === 'twitter') && renderBasicFormatOptions()}

              {/* Carousel UI for Playlists / Carousels */}
              {mediaInfo?.isPlaylist && mediaInfo.items && (
                platform === 'spotify' ? (
                  <PlaylistView 
                    mediaInfo={mediaInfo}
                    selectedIndices={selectedIndices} 
                    setSelectedIndices={setSelectedIndices} 
                  />
                ) : (
                  <Carousel 
                    items={mediaInfo.items} 
                    selectedIndices={selectedIndices} 
                    setSelectedIndices={setSelectedIndices} 
                  />
                )
              )}

              {/* URL Input */}
              <div className={`url-field ${urlError ? 'has-error' : ''}`}>
                <div className="url-input-wrap">
                  <span className="url-input-icon">{ICONS.link}</span>
                  <input
                    id="urlInput"
                    type="url"
                    className={`url-input with-icon ${urlError ? 'input-error' : ''}`}
                    placeholder={PLACEHOLDER[platform]}
                    value={url}
                    onChange={e => { setUrl(e.target.value); setUrlError(''); setStatus('idle'); }}
                    disabled={isActive}
                    aria-label="Media URL"
                    autoComplete="off"
                    spellCheck="false"
                  />
                  {url && (
                    <button type="button" className="url-clear visible" onClick={() => { setUrl(''); setUrlError(''); }} aria-label="Clear">✕</button>
                  )}
                </div>
              </div>

              {urlError && <div className="url-error-msg" role="alert">⚠ {urlError}</div>}
              {platform === 'instagram' && <div className="private-note">🔒 Private accounts are not supported</div>}
              
              {/* Global Fetching Spinner */}
              {infoLoading && (
                <div className="info-loading" style={{ textAlign: 'center', margin: '15px 0', color: 'var(--text-secondary)' }}>
                  <span className="spinner" /> Fetching media information...
                </div>
              )}

              {/* Bottom Options (YouTube info) */}
              {platform === 'youtube' && renderYouTubeOptions()}

              {/* Download Button */}
              <button
                id="downloadBtn"
                type="submit"
                className={`download-btn full-width platform-${platform}`}
                disabled={isActive || !url.trim() || infoLoading || (mediaInfo?.isPlaylist && selectedIndices?.length === 0)}
                aria-label="Download"
              >
                {isActive ? (
                  <>
                    <span className="spinner" />
                    {status === 'processing' ? 'Processing...' : 'Starting...'}
                  </>
                ) : (mediaInfo?.isPlaylist && selectedIndices?.length > 1) 
                  ? `⬇ Download ${selectedIndices.length} Items as ZIP` 
                  : '⬇ Download'}
              </button>

              {/* Progress bar */}
              {isActive && (() => {
                // Parse message format: "Downloading 3/23 · Song Title · 1.23MiB/s"
                const isTrackMsg = message && message.startsWith('Downloading ') && message.includes('/') && message.includes(' · ');
                let trackNum = null, trackTotal = null, trackTitle = null, trackSpeed = null;
                if (isTrackMsg) {
                  const parts = message.split(' · ');
                  const numPart = parts[0]?.replace('Downloading ', '').split('/');
                  trackNum = parseInt(numPart?.[0]);
                  trackTotal = parseInt(numPart?.[1]);
                  trackTitle = parts[1] || '';
                  trackSpeed = parts[2] || null;
                }

                return (
                  <div className="progress-section" role="status" aria-live="polite" style={{ marginTop: '16px' }}>
                    {isTrackMsg ? (
                      <div style={{
                        background: 'rgba(29,185,84,0.07)',
                        border: '1px solid rgba(29,185,84,0.2)',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        marginBottom: '10px',
                      }}>
                        {/* Track counter badge + title */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <div style={{
                            background: '#1DB954', color: '#000', borderRadius: '6px',
                            padding: '3px 10px', fontSize: '0.78rem', fontWeight: '800',
                            letterSpacing: '0.03em', flexShrink: 0,
                          }}>
                            {trackNum} / {trackTotal}
                          </div>
                          <span style={{
                            color: '#fff', fontSize: '0.9rem', fontWeight: '600',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {trackTitle}
                          </span>
                          {trackSpeed && (
                            <span style={{ color: '#888', fontSize: '0.78rem', flexShrink: 0, marginLeft: 'auto' }}>
                              {trackSpeed}
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '4px', height: '5px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${progress}%`, height: '100%',
                            background: 'linear-gradient(90deg, #1DB954, #4ade80)',
                            borderRadius: '4px', transition: 'width 0.4s ease',
                          }} />
                        </div>

                        {/* Overall stats row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.75rem', color: '#666' }}>
                          <span>{trackTotal ? `${trackTotal - trackNum} remaining` : ''}</span>
                          <span>{Math.round(progress)}% overall</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '10px' }}>
                        <div className="progress-header">
                          <span className="progress-message">{message}</span>
                          <span className="progress-pct">{Math.round(progress)}%</span>
                        </div>
                        <div className="progress-bar-wrap" role="progressbar"
                          aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                          <div className="progress-bar" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                    <button id="cancelBtn" type="button" className="cancel-btn mx-auto" onClick={handleCancel}>✕ Cancel</button>
                  </div>
                );
              })()}


              {/* Error */}
              {status === 'error' && errorMsg && (
                <div role="alert" style={{
                  marginTop: '16px',
                  borderRadius: '14px',
                  border: '1.5px solid rgba(239,68,68,0.35)',
                  background: 'rgba(239,68,68,0.07)',
                  padding: '16px 18px',
                  display: 'flex', flexDirection: 'column', gap: '12px',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem',
                    }}>❌</div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#ff6b6b' }}>Download Failed</div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '1px' }}>
                        {platform === 'spotify' ? 'Spotify' : platform === 'youtube' ? 'YouTube' : platform === 'instagram' ? 'Instagram' : platform === 'tiktok' ? 'TikTok' : 'X'} · {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {/* Error detail */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
                    padding: '10px 14px', fontFamily: 'monospace',
                    fontSize: '0.8rem', color: '#fca5a5', lineHeight: '1.5',
                    wordBreak: 'break-word', maxHeight: '120px', overflowY: 'auto',
                  }}>
                    {errorMsg}
                  </div>

                  {/* Common causes hint */}
                  <div style={{ fontSize: '0.75rem', color: '#666', lineHeight: '1.6' }}>
                    <strong style={{ color: '#888' }}>Possible causes:</strong>
                    {platform === 'spotify' && <span> · Private playlist · Track not available in your region · Spotify API limit</span>}
                    {platform === 'youtube' && <span> · Age-restricted · Private/deleted video · Bot detection</span>}
                    {platform === 'instagram' && <span> · Private account · Story expired · Login required</span>}
                    {(platform === 'tiktok' || platform === 'x') && <span> · Private account · Content removed · Rate limited</span>}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      style={{
                        flex: '1', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.4)',
                        color: '#ff6b6b', fontWeight: '700', fontSize: '0.82rem',
                        transition: 'all 0.15s',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                    >
                      🔄 Retry
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      style={{
                        flex: '1', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)',
                        color: '#aaa', fontWeight: '700', fontSize: '0.82rem',
                        transition: 'all 0.15s',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                      ✕ Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Success */}
              {status === 'complete' && (
                <div className="success-section" role="status">
                  <span className="success-icon">✅</span>
                  <div className="success-title">Download Complete!</div>
                  <p className="success-sub">Your file is downloading. Check your downloads folder.</p>
                  <button type="button" className="cancel-btn mx-auto mt-2" onClick={handleCancel}>+ New Download</button>
                </div>
              )}
            </form>

          </div>
        </main>

        {renderQualityModal()}

        <footer className="footer" role="contentinfo">
          <div className="footer-brand">VOUXIFY - Made by <a href="https://github.com/stevoux" target="_blank" rel="noopener noreferrer">STEVOUX</a></div>
          <p className="footer-disclaimer" style={{ marginTop: '12px' }}>
            <span style={{ color: '#ffb347' }}>⚠️</span> For educational purposes only. Downloading copyrighted content without proper authorization may violate the terms of service of respective platforms.
          </p>
        </footer>
      </div>
    </>
  );
}