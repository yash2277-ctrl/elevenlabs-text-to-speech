import { useState } from 'react';
import { Download } from 'lucide-react';

export default function SoundEffects() {
  const [text, setText] = useState('');
  const [duration, setDuration] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);

  const handleGenerate = async () => {
    if (!text) return;
    setIsGenerating(true);
    setAudioUrl(null);
    
    const formData = new FormData();
    formData.append('text', text);
    formData.append('duration_seconds', duration.toString());

    try {
      const response = await fetch('http://localhost:8000/api/v1/sound-generation', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("SFX Generation failed");

      const blob = await response.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error(error);
      alert('Error generating sound effect. Please ensure the backend is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>Sound Effects</h2>
        <p>Generate high-quality sound effects from text descriptions.</p>
      </header>

      <div className="two-col-layout">
        <div className="left-panel">
          <div className="settings-card">
            <h3>Settings</h3>
            <div className="form-group">
              <label className="slider-label">
                <span>Duration (Seconds)</span>
                <span>{duration}s</span>
              </label>
              <input type="range" min="1" max="22" value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Prompt Influence</label>
              <input type="range" min="0" max="100" defaultValue="75" />
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="editor-card">
            <textarea 
              placeholder="Describe the sound effect (e.g., 'Cinematic bass drop', 'Footsteps on wet gravel')..." 
              value={text} 
              onChange={e => setText(e.target.value)}
              rows={4}
              style={{ minHeight: '150px' }}
            />
            
            <div className="editor-footer">
              <span className="char-count">{text.length} / 500</span>
              <button className="generate-btn" onClick={handleGenerate} disabled={isGenerating || !text}>
                {isGenerating ? 'Generating...' : 'Generate SFX'}
              </button>
            </div>
          </div>

          {audioUrl && (
            <div className="audio-result-card">
              <audio src={audioUrl} controls autoPlay />
              <a href={audioUrl} download={`${text.replace(/\s+/g, '_')}.mp3`} className="icon-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={20} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
