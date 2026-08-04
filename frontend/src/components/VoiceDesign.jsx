import { useState } from 'react';
import { Wand2, Play, Download } from 'lucide-react';

export default function VoiceDesign() {
  const [prompt, setPrompt] = useState('A confident middle-aged man with a deep, resonant British accent, reading a fantasy audiobook.');
  const [gender, setGender] = useState('male');
  const [age, setAge] = useState('middle-aged');
  const [accent, setAccent] = useState('british');
  const [accentStrength, setAccentStrength] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setAudioUrl(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/voice-generation/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gender,
          age,
          accent,
          accent_strength: accentStrength,
          text: prompt
        })
      });

      if (!response.ok) throw new Error("Voice design failed");

      const blob = await response.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error(error);
      alert('Error designing voice. Please check that the backend is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>Voice Design</h2>
        <p>Generate entirely new voices by simply describing them.</p>
      </header>

      <div className="two-col-layout">
        <div className="left-panel">
          <div className="editor-card" style={{ height: 'auto', minHeight: '300px' }}>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the voice you want to generate..."
              style={{ width: '100%', height: '200px', background: 'transparent', border: 'none', color: 'var(--text-color)', resize: 'none', fontSize: '1.1rem', lineHeight: '1.5' }}
            />
            <div className="editor-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
               <button className="generate-btn" onClick={handleGenerate} disabled={isGenerating}>
                 <Wand2 size={18} style={{ marginRight: '0.5rem' }} />
                 {isGenerating ? 'Designing...' : 'Generate Voice'}
               </button>
            </div>
          </div>

          {audioUrl && (
            <div className="audio-result-card" style={{ marginTop: '1.5rem' }}>
              <audio src={audioUrl} controls autoPlay />
              <a href={audioUrl} download="designed_voice.mp3" className="icon-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={20} />
              </a>
            </div>
          )}
        </div>

        <div className="right-panel">
           <div className="settings-card">
              <h3>Design Parameters</h3>
              
              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label>Gender</label>
                <select value={gender} onChange={e => setGender(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label>Age</label>
                <select value={age} onChange={e => setAge(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}>
                  <option value="young">Young</option>
                  <option value="middle-aged">Middle Aged</option>
                  <option value="old">Old</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label>Accent</label>
                <select value={accent} onChange={e => setAccent(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}>
                  <option value="american">American</option>
                  <option value="british">British</option>
                  <option value="australian">Australian</option>
                  <option value="african">African</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="slider-label">
                  <span>Accent Strength</span>
                  <span>{Math.round(accentStrength * 100)}%</span>
                </label>
                <input type="range" min="0.3" max="2.0" step="0.1" value={accentStrength} onChange={e => setAccentStrength(Number(e.target.value))} style={{ width: '100%', marginTop: '0.5rem' }} />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
