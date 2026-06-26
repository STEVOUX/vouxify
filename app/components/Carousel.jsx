import React, { useState, useRef } from 'react';

const ChevronLeft = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const ChevronRight = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;
const VolumeIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>;
const MutedIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>;
const CheckIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;

export default function Carousel({ items, selectedIndices, setSelectedIndices }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];
  const isSelected = selectedIndices.includes(currentIndex + 1); // 1-based index for yt-dlp

  const toggleSelection = () => {
    const idx = currentIndex + 1;
    if (isSelected) {
      setSelectedIndices(prev => prev.filter(i => i !== idx));
    } else {
      setSelectedIndices(prev => [...prev, idx]);
    }
  };

  const selectAll = () => setSelectedIndices(items.map((_, i) => i + 1));
  const deselectAll = () => setSelectedIndices([]);

  return (
    <div className="carousel-container" style={{
      background: 'rgba(255,255,255,0.05)',
      borderRadius: '16px',
      padding: '20px',
      marginTop: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Media Preview ({currentIndex + 1} of {items.length})</h3>
        <div>
          <button type="button" onClick={selectAll} style={{ background: 'none', border: 'none', color: '#00F2FE', cursor: 'pointer', marginRight: '10px' }}>Select All</button>
          <button type="button" onClick={deselectAll} style={{ background: 'none', border: 'none', color: '#FE2C55', cursor: 'pointer' }}>Deselect All</button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
        {currentItem.url && currentItem.vcodec !== 'image' && currentItem.ext !== 'jpg' && (currentItem.ext === 'mp4' || currentItem.vcodec !== 'none' || currentItem.duration > 0 || currentItem.url.includes('.mp4')) ? (
          <>
            <video 
              ref={videoRef}
              src={currentItem.url} 
              referrerPolicy="no-referrer"
              controls 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onPlay={() => { if (audioRef.current) audioRef.current.play().catch(()=>{}); }}
              onPause={() => { if (audioRef.current) audioRef.current.pause(); }}
              onSeeked={() => { if (audioRef.current && videoRef.current) audioRef.current.currentTime = videoRef.current.currentTime; }}
              onWaiting={() => { if (audioRef.current) audioRef.current.pause(); }}
              onPlaying={() => { if (audioRef.current) audioRef.current.play().catch(()=>{}); }}
            />
            {currentItem.audioUrl && (
              <>
                <audio ref={audioRef} src={currentItem.audioUrl} preload="auto" />
                <button 
                  type="button"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (audioRef.current) {
                      audioRef.current.muted = !audioRef.current.muted;
                      setIsMuted(audioRef.current.muted);
                      if (videoRef.current && !videoRef.current.paused && audioRef.current.paused) {
                          audioRef.current.play().catch(()=>{});
                      }
                    }
                  }}
                  style={{
                    position: 'absolute', top: '15px', right: '15px', 
                    background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer',
                    zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(10px)', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                  title={isMuted ? "Unmute Audio" : "Mute Audio"}
                >
                  {isMuted ? <MutedIcon /> : <VolumeIcon />}
                </button>
              </>
            )}
          </>
        ) : (
          <img src={currentItem.thumbnail || currentItem.url} alt={currentItem.title} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
        
        {/* Navigation arrows */}
        {currentIndex > 0 && (
          <button type="button" onClick={() => setCurrentIndex(i => i - 1)} style={arrowStyle('left')}><ChevronLeft /></button>
        )}
        {currentIndex < items.length - 1 && (
          <button type="button" onClick={() => setCurrentIndex(i => i + 1)} style={arrowStyle('right')}><ChevronRight /></button>
        )}
      </div>

      {/* Modern Checkbox Row */}
      <div 
        style={{ 
          display: 'flex', alignItems: 'center', gap: '15px', 
          background: isSelected ? 'rgba(0, 242, 254, 0.1)' : 'rgba(0,0,0,0.2)', 
          border: isSelected ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid rgba(255,255,255,0.05)',
          padding: '12px 18px', borderRadius: '12px', cursor: 'pointer',
          transition: 'all 0.2s ease-in-out'
        }} 
        onClick={toggleSelection}
      >
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px', 
          background: isSelected ? 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)' : 'rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#000', transition: 'all 0.2s', border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.2)'
        }}>
          {isSelected && <CheckIcon />}
        </div>
        <span style={{ color: isSelected ? '#fff' : '#ccc', fontSize: '15px', fontWeight: '500' }}>
          Include this {(currentItem.ext === 'mp4' || currentItem.vcodec !== 'none' || currentItem.duration > 0 || currentItem.url?.includes('.mp4')) ? 'video' : 'photo'} in ZIP download
        </span>
      </div>
      <div style={{ color: '#aaa', fontSize: '13px', textAlign: 'center' }}>
        {selectedIndices.length} out of {items.length} items selected
      </div>
    </div>
  );
}

function arrowStyle(side) {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: '15px',
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.4)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  };
}
