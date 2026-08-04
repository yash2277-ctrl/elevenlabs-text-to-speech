import { useState } from 'react';
import { Upload, Copy, Check, Clock, FileText } from 'lucide-react';

export default function SpeechToText() {
  const [audioFile, setAudioFile] = useState(null);
  const [language, setLanguage] = useState('en');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAudioFile = (file) => file?.type?.startsWith('audio/') || file?.type?.startsWith('video/');

  const handleTranscribe = async () => {
    if (!audioFile) return;
    if (!isAudioFile(audioFile)) {
      alert(`Cannot read '${audioFile.name}' — this endpoint accepts audio/video files only, not images.`);
      return;
    }
    setIsTranscribing(true);
    setResult(null);

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('language', language);

    try {
      const response = await fetch('http://localhost:8000/api/v1/speech-to-text', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const errData = await response.text().catch(() => '');
        throw new Error(errData || `Transcription failed (${response.status})`);
      }
      const data = await response.json();
      setResult(data);
      fetchHistory();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/speech-to-text/history');
      if (response.ok) {
        const data = await response.json();
        setHistory(data.transcriptions || []);
      }
    } catch (error) {
      console.error("Error fetching history", error);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Speech to Text (Scribe)</h2>
          <p>Transcribe audio and video files with state-of-the-art accuracy.</p>
        </div>
        <button className="generate-btn" onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
          <Clock size={16} style={{ marginRight: '0.5rem' }} />
          {showHistory ? 'Hide History' : 'View History'}
        </button>
      </header>

      {showHistory ? (
        <div className="settings-card">
          <h3>Transcription History</h3>
          {history.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>No transcriptions yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
              {history.map((item, idx) => (
                <div key={item.job_id || idx} style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.language} &middot; {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                    </span>
                    <button onClick={() => copyToClipboard(item.text || '')} className="icon-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{item.text || 'No text'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="two-col-layout">
          <div className="left-panel">
            <div className="settings-card" style={{ padding: '3rem 2rem', textAlign: 'center', border: '2px dashed var(--border)', background: 'var(--bg-panel)' }}>
              <Upload size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto' }} />
              <h3>Upload Audio / Video</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Supports mp3, wav, mp4, m4a, ogg</p>
              <input type="file" accept="audio/*,video/*" onChange={(e) => setAudioFile(e.target.files[0])} style={{ display: 'none' }} id="stt-upload" />
              <label htmlFor="stt-upload" className="generate-btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
                Browse Files
              </label>
              {audioFile && <p style={{ marginTop: '1rem', color: 'var(--accent)' }}>{audioFile.name}</p>}
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem' }}>
              <label>Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="hi">Hindi</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
              </select>
            </div>

            <button className="generate-btn" style={{ width: '100%', marginTop: '1rem' }} onClick={handleTranscribe} disabled={!audioFile || isTranscribing}>
              {isTranscribing ? 'Transcribing...' : 'Transcribe'}
            </button>
          </div>

          <div className="right-panel">
            <div className="settings-card" style={{ minHeight: '300px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={20} />
                Transcription Result
              </h3>
              {result ? (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Detected language: {result.language || language}
                    </span>
                    <button onClick={() => copyToClipboard(result.text || '')} className="icon-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
                      {copied ? 'Copied' : 'Copy Text'}
                    </button>
                  </div>
                  <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', minHeight: '200px', whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: '1.6' }}>
                    {result.text || 'No transcription text returned.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px', color: 'var(--text-muted)' }}>
                  Upload an audio file and click Transcribe to see results here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
