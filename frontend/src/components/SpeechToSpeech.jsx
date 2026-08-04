import { useState, useEffect } from 'react';
import { Upload, ArrowRight, Play, Download } from 'lucide-react';

export default function SpeechToSpeech() {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [sourceFile, setSourceFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices) {
          setVoices(data.voices);
          if (data.voices.length > 0) {
            setSelectedVoice(data.voices[0].voice_id);
          }
        }
      })
      .catch(err => console.error("Could not fetch voices", err));
  }, []);

  const isAudioFile = (file) => file?.type?.startsWith('audio/');

  const handleGenerate = async () => {
    if (!sourceFile || !selectedVoice) {
      alert("Please upload a source audio file first and select a voice.");
      return;
    }
    if (!isAudioFile(sourceFile)) {
      alert(`Cannot read '${sourceFile.name}' — this endpoint accepts audio files only, not images.`);
      return;
    }
    
    setIsGenerating(true);
    setAudioUrl(null);

    const formData = new FormData();
    formData.append('audio', sourceFile);
    formData.append('model_id', 'eleven_english_sts_v2');

    try {
      const response = await fetch(`http://localhost:8000/api/v1/speech-to-speech/${selectedVoice}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.text().catch(() => '');
        throw new Error(errData || `Conversion failed (${response.status})`);
      }
      
      const blob = await response.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>Speech to Speech</h2>
        <p>Change the voice of your audio while preserving emotion, timing, and delivery.</p>
      </header>

      <div className="two-col-layout">
        <div className="left-panel">
          <div className="settings-card" style={{ padding: '3rem 2rem', textAlign: 'center', border: '2px dashed var(--border)', background: 'var(--bg-panel)' }}>
            <Upload size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto' }} />
            <h3>Upload Source Audio</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Drag and drop or click to upload</p>
            <input 
              type="file" 
              accept="audio/*" 
              onChange={(e) => setSourceFile(e.target.files[0])} 
              style={{ display: 'none' }} 
              id="sts-upload" 
            />
            <label htmlFor="sts-upload" className="generate-btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
              Browse Files
            </label>
            {sourceFile && <p style={{ marginTop: '1rem', color: 'var(--accent)' }}>{sourceFile.name}</p>}
          </div>
        </div>

        <div className="right-panel">
          <div className="settings-card">
            <h3>Target Voice</h3>
            <select 
              value={selectedVoice} 
              onChange={e => setSelectedVoice(e.target.value)} 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '1rem', marginBottom: '1.5rem' }}
            >
              {voices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
              ))}
            </select>

            <button className="generate-btn" style={{ width: '100%' }} onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? 'Converting...' : 'Convert Voice'}
            </button>
          </div>

          {audioUrl && (
            <div className="audio-result-card" style={{ marginTop: '1.5rem' }}>
              <audio src={audioUrl} controls autoPlay />
              <a href={audioUrl} download="converted_speech.mp3" className="icon-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={20} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
