import { useState } from 'react';
import { Upload, Download, Mic, Music } from 'lucide-react';

export default function VoiceIsolator() {
  const [audioFile, setAudioFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [originalUrl, setOriginalUrl] = useState(null);

  const isAudioFile = (file) => file?.type?.startsWith('audio/');

  const handleIsolate = async () => {
    if (!audioFile) return;
    if (!isAudioFile(audioFile)) {
      alert(`Cannot read '${audioFile.name}' — this endpoint accepts audio files only, not images.`);
      return;
    }
    setIsProcessing(true);
    setResultUrl(null);

    setOriginalUrl(URL.createObjectURL(audioFile));

    const formData = new FormData();
    formData.append('audio', audioFile);

    try {
      const response = await fetch('http://localhost:8000/api/v1/voice-isolator', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.text().catch(() => '');
        throw new Error(errData || `Isolation failed (${response.status})`);
      }

      const blob = await response.blob();
      setResultUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>Voice Isolator</h2>
        <p>Separate vocals from background music, noise, and other sounds.</p>
      </header>

      <div className="two-col-layout">
        <div className="left-panel">
          <div className="settings-card" style={{ padding: '3rem 2rem', textAlign: 'center', border: '2px dashed var(--border)', background: 'var(--bg-panel)' }}>
            <Upload size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto' }} />
            <h3>Upload Audio</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Upload a track to isolate vocals from music</p>
            <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files[0])} style={{ display: 'none' }} id="isolator-upload" />
            <label htmlFor="isolator-upload" className="generate-btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
              Browse Files
            </label>
            {audioFile && <p style={{ marginTop: '1rem', color: 'var(--accent)' }}>{audioFile.name}</p>}
          </div>

          <button className="generate-btn" style={{ width: '100%', marginTop: '1.5rem' }} onClick={handleIsolate} disabled={!audioFile || isProcessing}>
            {isProcessing ? 'Isolating Voice...' : 'Isolate Voice'}
          </button>
        </div>

        <div className="right-panel">
          {originalUrl && (
            <div className="settings-card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Music size={20} />
                Original Audio
              </h3>
              <audio src={originalUrl} controls style={{ width: '100%', marginTop: '1rem' }} />
            </div>
          )}

          {isProcessing && (
            <div className="settings-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>Processing audio... This may take a moment.</p>
            </div>
          )}

          {resultUrl && (
            <div className="settings-card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mic size={20} color="var(--accent)" />
                Isolated Voice
              </h3>
              <div className="audio-result-card" style={{ marginTop: '1rem' }}>
                <audio src={resultUrl} controls autoPlay />
                <a href={resultUrl} download="isolated_vocals.mp3" className="icon-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Download size={20} />
                </a>
              </div>
            </div>
          )}

          {!originalUrl && !isProcessing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', textAlign: 'center' }}>
              Upload an audio file with vocals and background music, then click "Isolate Voice".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
