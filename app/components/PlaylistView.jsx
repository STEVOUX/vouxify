import React from 'react';

const CheckboxIcon = ({ checked }) => (
  <div style={{
    width: '18px', height: '18px', borderRadius: '4px',
    border: checked ? 'none' : '1.5px solid #555',
    background: checked ? '#1DB954' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  }}>
    {checked && (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )}
  </div>
);

function formatTime(s) {
  if (!s || isNaN(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function PlaylistView({ mediaInfo, selectedIndices, setSelectedIndices }) {
  if (!mediaInfo) return null;

  const items = mediaInfo.items || [];
  const allSelected = items.length > 0 && selectedIndices.length === items.length;

  const toggleAll = () => {
    if (allSelected) setSelectedIndices([]);
    else setSelectedIndices(items.map((_, i) => i + 1));
  };

  const toggleItem = (idx) => {
    if (selectedIndices.includes(idx)) {
      setSelectedIndices(prev => prev.filter(i => i !== idx));
    } else {
      setSelectedIndices(prev => [...prev, idx].sort((a, b) => a - b));
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(180deg, #1a1a2e 0%, #121212 100%)',
      borderRadius: '16px',
      overflow: 'hidden',
      marginTop: '20px',
      border: '1px solid rgba(255,255,255,0.08)',
      fontFamily: 'var(--font)',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        padding: '20px',
        gap: '20px',
        alignItems: 'center',
        background: 'linear-gradient(135deg, rgba(29,185,84,0.15) 0%, rgba(0,0,0,0) 70%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <img
          src={mediaInfo.thumbnail || 'https://via.placeholder.com/100x100/1a1a1a/ffffff?text=♫'}
          alt={mediaInfo.title}
          style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#1DB954', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
            PLAYLIST
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff', letterSpacing: '-0.03em', lineHeight: '1.1', marginBottom: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mediaInfo.title || 'Playlist'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '20px', padding: '4px 12px' }}>
              <span style={{ fontSize: '0.8rem', color: '#b3b3b3', fontWeight: '500' }}>
                {items.length} songs
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(29,185,84,0.15)', borderRadius: '20px', padding: '4px 12px', border: '1px solid rgba(29,185,84,0.3)' }}>
              <span style={{ fontSize: '0.8rem', color: '#1DB954', fontWeight: '600' }}>
                {selectedIndices.length} selected
              </span>
            </div>
          </div>
        </div>
        {/* Select All toggle */}
        <button
          type="button"
          onClick={toggleAll}
          style={{
            background: allSelected ? 'rgba(255,255,255,0.1)' : '#1DB954',
            color: allSelected ? '#b3b3b3' : '#000',
            border: allSelected ? '1px solid rgba(255,255,255,0.15)' : 'none',
            borderRadius: '500px',
            padding: '10px 20px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* ── Column Headers ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 40px 1fr 1fr 52px',
        padding: '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        color: '#6a6a8a',
        fontSize: '0.72rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        userSelect: 'none',
      }}>
        <div />
        <div style={{ textAlign: 'center' }}>#</div>
        <div>Title</div>
        <div>Album</div>
        <div style={{ textAlign: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      </div>

      {/* ── Track List (tall, scrollable) ── */}
      <div style={{
        maxHeight: '60vh',
        minHeight: items.length === 0 ? '120px' : '0',
        overflowY: 'auto',
        overflowX: 'hidden',
        // Custom scrollbar styles applied via CSS class below
      }} className="playlist-scroll">
        {items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px', color: '#555', gap: '8px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <span style={{ fontSize: '0.9rem' }}>No tracks found in this playlist</span>
          </div>
        ) : (
          items.map((item, i) => {
            const idx = i + 1;
            const isSelected = selectedIndices.includes(idx);
            return (
              <div
                key={item.id || idx}
                onClick={() => toggleItem(idx)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 40px 1fr 1fr 52px',
                  padding: '6px 16px',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(29,185,84,0.08)' : 'transparent',
                  borderLeft: isSelected ? '2px solid #1DB954' : '2px solid transparent',
                  transition: 'all 0.15s ease',
                  minHeight: '52px',
                }}
                onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <CheckboxIcon checked={isSelected} />
                </div>

                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#555', fontWeight: '500' }}>
                  {idx}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" style={{ width: '38px', height: '38px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '38px', height: '38px', borderRadius: '4px', background: '#282828', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 14.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-5.5a1 1 0 100 2 1 1 0 000-2z" /></svg>
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      color: isSelected ? '#1DB954' : '#fff',
                      fontSize: '0.88rem',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: '1.3',
                    }}>
                      {item.title}
                    </div>
                    <div style={{ color: '#888', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.artist}
                    </div>
                  </div>
                </div>

                <div style={{ color: '#666', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '12px' }}>
                  {item.album}
                </div>

                <div style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(item.duration)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer summary ── */}
      {items.length > 0 && (
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          color: '#666',
        }}>
          <span>{selectedIndices.length} of {items.length} tracks selected</span>
          {selectedIndices.length > 1 && (
            <span style={{ color: '#1DB954', fontWeight: '600' }}>
              Will download as ZIP
            </span>
          )}
          {selectedIndices.length === 1 && (
            <span style={{ color: '#b3b3b3' }}>
              Will download as MP3
            </span>
          )}
        </div>
      )}
    </div>
  );
}
