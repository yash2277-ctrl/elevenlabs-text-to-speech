import { useState } from 'react';
import { Video, Languages, Download } from 'lucide-react';

export default function Dubbing() {
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('es');
  const [isTranslating, setIsTranslating] = useState(false);
  const [dubResult, setDubResult] = useState(null);

  const isMediaFile = (file) => file?.type?.startsWith('audio/') || file?.type?.startsWith('video/');

  const handleDub = async () => {
    if (!sourceFile) return;
    if (!isMediaFile(sourceFile)) {
      alert(`Cannot read '${sourceFile.name}' — this endpoint accepts audio/video files only, not images.`);
      return;
    }
    setIsTranslating(true);
    setDubResult(null);

    const formData = new FormData();
    formData.append('file', sourceFile);
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);

    try {
      const response = await fetch('http://localhost:8000/api/v1/dubbing', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errData = await response.text().catch(() => '');
        throw new Error(errData || `Dubbing failed (${response.status})`);
      }

      const result = await response.json();
      setDubResult(result);
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>AI Dubbing & Video Translation</h2>
        <p>Translate videos into 29 languages while preserving the original voices.</p>
      </header>

      <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="settings-card" style={{ padding: '2rem' }}>
           <h3 style={{ marginBottom: '1rem' }}>Source Video</h3>
           <div style={{ padding: '3rem 2rem', textAlign: 'center', border: '2px dashed var(--border)', background: 'var(--bg-panel)', borderRadius: '8px' }}>
            <Video size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto' }} />
            <input 
              type="file" 
              accept="video/*,audio/*" 
              onChange={(e) => setSourceFile(e.target.files[0])} 
              style={{ display: 'none' }} 
              id="video-upload" 
            />
            <label htmlFor="video-upload" className="generate-btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
              Upload Video/Audio
            </label>
            {sourceFile && <p style={{ marginTop: '1rem', color: 'var(--accent)' }}>{sourceFile.name}</p>}
           </div>
           
           <div style={{ marginTop: '1.5rem' }}>
             <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Source Language</label>
             <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }}>
                <option value="auto">Auto-Detect</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
             </select>
           </div>
        </div>

        <div className="settings-card" style={{ padding: '2rem' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
             <Languages size={24} color="var(--accent)" />
             <h3 style={{ margin: 0 }}>Translation Settings</h3>
           </div>
           
           <div style={{ marginTop: '1.5rem' }}>
             <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Target Language</label>
             <select value={targetLang} onChange={e => setTargetLang(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }}>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="hi">Hindi</option>
                <option value="ja">Japanese</option>
             </select>
           </div>

           <div style={{ marginTop: '2rem' }}>
             <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <input type="checkbox" defaultChecked />
               <span>Preserve background audio (music, effects)</span>
             </label>
           </div>

           <button 
              className="generate-btn" 
              style={{ width: '100%', marginTop: '3rem' }} 
              onClick={handleDub}
              disabled={!sourceFile || isTranslating}
            >
              {isTranslating ? 'Translating & Dubbing...' : 'Start Dubbing'}
           </button>

           {dubResult && (
             <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
               <h4 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Dubbing Job Created!</h4>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}>Job ID: <span style={{ fontFamily: 'monospace' }}>{dubResult.dubbing_id}</span></p>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}>Status: <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{dubResult.status}</span></p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
