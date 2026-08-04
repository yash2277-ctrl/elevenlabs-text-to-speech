import { useState } from 'react';
import { Music, Download, Play } from 'lucide-react';

export default function MusicGeneration() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(10);
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setAudioUrl(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/music-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: duration,
          genre: genre || undefined,
          mood: mood || undefined
        })
      });

      if (!response.ok) throw new Error("Music generation failed");

      const blob = await response.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error(error);
      alert('Error generating music. Please ensure the backend is running.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>Music Generation</h2>
        <p>Generate original music and instrumentals from text descriptions.</p>
      </header>

      <div className="two-col-layout">
        <div className="left-panel">
          <div className="settings-card">
            <h3>Settings</h3>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Genre</label>
              <select value={genre} onChange={e => setGenre(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }}>
                <option value="">Auto</option>
                <option value="electronic">Electronic</option>
                <option value="cinematic">Cinematic</option>
                <option value="ambient">Ambient</option>
                <option value="lo-fi">Lo-Fi</option>
                <option value="jazz">Jazz</option>
                <option value="rock">Rock</option>
                <option value="pop">Pop</option>
                <option value="classical">Classical</option>
                <option value="hip-hop">Hip Hop</option>
              </select>
            </div>

            <div className="form-group">
              <label>Mood</label>
              <select value={mood} onChange={e => setMood(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }}>
                <option value="">Auto</option>
                <option value="happy">Happy</option>
                <option value="sad">Sad</option>
                <option value="dark">Dark</option>
                <option value="uplifting">Uplifting</option>
                <option value="calm">Calm</option>
                <option value="suspenseful">Suspenseful</option>
              </select>
            </div>

            <div className="form-group">
              <label className="slider-label">
                <span>Duration</span>
                <span>{duration}s</span>
              </label>
              <input type="range" min="5" max="60" value={duration} onChange={e => setDuration(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="editor-card">
            <textarea
              placeholder="Describe the music you want to generate... (e.g., 'A cinematic orchestral piece with rising tension, perfect for a movie trailer')"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              style={{ minHeight: '180px' }}
            />
            <div className="editor-footer">
              <span className="char-count">{prompt.length} / 1000</span>
              <button className="generate-btn" onClick={handleGenerate} disabled={isGenerating || !prompt}>
                {isGenerating ? 'Generating...' : 'Generate Music'}
              </button>
            </div>
          </div>

          {audioUrl && (
            <div className="audio-result-card">
              <audio src={audioUrl} controls autoPlay />
              <a href={audioUrl} download={`music_${Date.now()}.mp3`} className="icon-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={20} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
