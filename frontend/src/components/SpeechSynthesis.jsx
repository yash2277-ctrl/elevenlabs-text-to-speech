import { useState, useEffect, useRef } from 'react';
import { Play, Download, Settings, ChevronDown, ChevronUp, Mic, Globe, Type } from 'lucide-react';

export default function SpeechSynthesis() {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [text, setText] = useState('');
  
  const [showSettings, setShowSettings] = useState(false);
  const [showVoiceSelect, setShowVoiceSelect] = useState(false);
  const dropdownRef = useRef(null);

  const [stability, setStability] = useState(50);
  const [similarity, setSimilarity] = useState(75);
  const [emotion, setEmotion] = useState('');
  const [speed, setSpeed] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [language, setLanguage] = useState('en');
  const [languages, setLanguages] = useState([]);
  const [showLangSelect, setShowLangSelect] = useState(false);
  const [elevenlabsActive, setElevenlabsActive] = useState(false);
  const langDropdownRef = useRef(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/user')
      .then(res => res.json())
      .then(data => setElevenlabsActive(data?.xi_api_key === '****'))
      .catch(() => {});
    fetch('http://localhost:8000/api/v1/voices')
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(data => {
        if (data.voices && data.voices.length > 0) {
          setVoices(data.voices);
          setSelectedVoice(data.voices[0]);
        } else {
          setFetchError('No voices returned from API');
        }
      })
      .catch(err => { console.error("Voice fetch error:", err); setFetchError(err.message); });
    fetch('http://localhost:8000/api/v1/languages')
      .then(res => res.json())
      .then(data => { if (data.languages) setLanguages(data.languages); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target)) {
        setShowLangSelect(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [langDropdownRef]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowVoiceSelect(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleGenerate = async () => {
    if (!text || !selectedVoice) return;
    if (wordCount > 5000) {
      alert("Text exceeds 5000 word limit.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/text-to-speech/${selectedVoice.voice_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language,
          genre: 'auto',
          voice_settings: {
            stability: stability / 100,
            similarity_boost: similarity / 100
          },
          emotion: emotion || undefined,
          speed: speed !== 1.0 ? speed : undefined
        })
      });

      if (!response.ok) {
        const errData = await response.text().catch(() => '');
        throw new Error(errData || `Server error ${response.status}`);
      }

      const blob = await response.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (error) {
      alert(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const currentVoiceName = selectedVoice ? selectedVoice.name : (fetchError ? 'Error loading' : 'Loading...');

  return (
    <div className="page-container">
      {/* Top Bar for Selectors */}
      <div className="top-bar">
        <div className="model-voice-selectors">
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button className="selector-btn" onClick={() => setShowVoiceSelect(!showVoiceSelect)}>
              <Mic size={16} />
              {currentVoiceName}
              <ChevronDown size={14} />
            </button>
            
            {showVoiceSelect && voices.length > 0 && (
              <div className="dropdown-menu">
                {voices.map(v => (
                  <div 
                    key={v.voice_id} 
                    className="dropdown-item"
                    onClick={() => { setSelectedVoice(v); setShowVoiceSelect(false); }}
                  >
                    <div className="avatar" style={{ marginRight: '0.5rem' }}>
                      {v.name.charAt(0)}
                    </div>
                    {v.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }} ref={langDropdownRef}>
            <button className="selector-btn" onClick={() => setShowLangSelect(!showLangSelect)}>
              <Globe size={16} />
              {languages.find(l => l.code === language)?.name || language.toUpperCase()}
              <ChevronDown size={14} />
            </button>
            {showLangSelect && languages.length > 0 && (
              <div className="dropdown-menu" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {languages.map(l => (
                  <div key={l.code} className="dropdown-item" style={l.code === language ? { background: 'var(--accent)', color: '#fff' } : {}}
                    onClick={() => { setLanguage(l.code); setShowLangSelect(false); }}>
                    {l.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button className="selector-btn" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={16} />
            Voice Settings
          </button>
          {elevenlabsActive ? (
            <span style={{marginLeft:'0.5rem',fontSize:'0.7rem',padding:'2px 8px',borderRadius:'12px',background:'#22c55e',color:'#fff',fontWeight:'600'}}>ELEVENLABS</span>
          ) : (
            <span style={{marginLeft:'0.5rem',fontSize:'0.7rem',padding:'2px 8px',borderRadius:'12px',background:'#f59e0b',color:'#fff',fontWeight:'600',cursor:'pointer'}}
                  title="Set ELEVENLABS_API_KEY in backend/.env for premium quality"
                  onClick={() => alert('For ElevenLabs-quality voices, set ELEVENLABS_API_KEY in backend/.env to your real API key (get one at elevenlabs.io). Currently using free fallback TTS.')}>
              ⚡ FREE TTS
            </span>
          )}
        </div>
      </div>

      {/* Main Text Editor Area */}
      <div className="editor-area">
        {showSettings && (
          <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border)' }}>
            <div style={{display: 'flex', gap: '1rem'}}>
              <div style={{flex: 1}}>
                <label style={{display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem'}}>Stability: {stability}%</label>
                <input type="range" min="0" max="100" value={stability} onChange={e => setStability(e.target.value)} />
              </div>
              <div style={{flex: 1}}>
                <label style={{display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem'}}>Similarity: {similarity}%</label>
                <input type="range" min="0" max="100" value={similarity} onChange={e => setSimilarity(e.target.value)} />
              </div>
              <div style={{flex: 1}}>
                <label style={{display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem'}}>Speed: {speed.toFixed(1)}x</label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={speed} onChange={e => setSpeed(Number(e.target.value))} />
              </div>
              <div style={{flex: 1}}>
                <label style={{display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem'}}>Emotion</label>
                <select value={emotion} onChange={e => setEmotion(e.target.value)} style={{padding: '0.2rem', fontSize: '0.8rem'}}>
                  <option value="">Neutral</option>
                  <option value="happy">Happy</option>
                  <option value="sad">Sad</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="text-area-wrapper">
          <textarea
            className="main-textarea"
            placeholder="Type your text here..."
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className="editor-bottom-bar">
            <span className="char-count" style={wordCount > 5000 ? {color: '#ff4444'} : {}}>{wordCount} / 5000 words ({text.length} chars)</span>
          </div>
        </div>
      </div>

      {/* Controls Bar at bottom */}
      <div className="controls-bar">
        <div className="audio-player-wrapper">
           {audioUrl ? (
              <audio src={audioUrl} controls autoPlay />
           ) : (
              <span style={{color: 'var(--text-dim)', fontSize: '0.9rem'}}>No audio generated yet</span>
           )}
        </div>
        
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating || !text || !selectedVoice}
          style={{marginLeft: '1.5rem'}}
        >
          {isGenerating ? (
             <><span style={{animation: 'spin 1s linear infinite'}}>⟳</span> Generating</>
          ) : (
             <>Generate</>
          )}
        </button>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
