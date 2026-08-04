import { useState, useEffect } from 'react';
import { Plus, Play, UserCircle, Trash2, Volume2, Sparkles, Download } from 'lucide-react';

export default function Projects() {
  const [projectName, setProjectName] = useState('My Audiobook');
  const [voices, setVoices] = useState([]);
  const [paragraphs, setParagraphs] = useState([
    { id: 1, text: 'In a hole in the ground there lived a hobbit.', voice: '21m00Tcm4TlvDq8ikWAM', audioUrl: null, isGenerating: false },
    { id: 2, text: 'Not a nasty, dirty, wet hole, filled with the ends of worms and an oozy smell.', voice: 'pNInz6obpgDQGcFmaJgB', audioUrl: null, isGenerating: false },
    { id: 3, text: 'Nor yet a dry, bare, sandy hole with nothing in it to sit down on or to eat.', voice: '21m00Tcm4TlvDq8ikWAM', audioUrl: null, isGenerating: false },
  ]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices) {
          setVoices(data.voices);
          // Update initial paragraph voice selection if needed to match fetched voices
          if (data.voices.length > 0) {
            setParagraphs(prev => prev.map(p => {
              const matchesVoice = data.voices.some(v => v.voice_id === p.voice);
              return matchesVoice ? p : { ...p, voice: data.voices[0].voice_id };
            }));
          }
        }
      })
      .catch(err => console.error("Could not fetch voices", err));
  }, []);

  const addParagraph = () => {
    const defaultVoice = voices.length > 0 ? voices[0].voice_id : '21m00Tcm4TlvDq8ikWAM';
    setParagraphs(prev => [...prev, { id: Date.now(), text: '', voice: defaultVoice, audioUrl: null, isGenerating: false }]);
  };

  const updateParagraph = (id, field, value) => {
    setParagraphs(prev => prev.map(p => {
      if (p.id === id) {
        // Clear audioUrl if text or voice changes, since audio is no longer in sync
        const extra = (field === 'text' || field === 'voice') ? { audioUrl: null } : {};
        return { ...p, [field]: value, ...extra };
      }
      return p;
    }));
  };

  const removeParagraph = (id) => {
    setParagraphs(prev => prev.filter(p => p.id !== id));
  };

  const generateParagraph = async (id) => {
    const p = paragraphs.find(para => para.id === id);
    if (!p || !p.text) return;

    // Set generating state
    setParagraphs(prev => prev.map(para => para.id === id ? { ...para, isGenerating: true } : para));

    try {
      const response = await fetch(`http://localhost:8000/api/v1/text-to-speech/${p.voice}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: p.text
        })
      });

      if (!response.ok) throw new Error("Generation failed");

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      setParagraphs(prev => prev.map(para => para.id === id ? { ...para, audioUrl, isGenerating: false } : para));
    } catch (error) {
      console.error(error);
      alert("Error generating audio for paragraph.");
      setParagraphs(prev => prev.map(para => para.id === id ? { ...para, isGenerating: false } : para));
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    for (let p of paragraphs) {
      if (p.text && !p.audioUrl) {
        await generateParagraph(p.id);
      }
    }
    setIsGeneratingAll(false);
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Projects</h2>
            <p>Long-form content editor. Assign different voices to different paragraphs.</p>
          </div>
          <button className="generate-btn" onClick={handleGenerateAll} disabled={isGeneratingAll || paragraphs.every(p => !p.text || p.audioUrl)}>
            <Sparkles size={16} style={{ marginRight: '0.5rem' }} />
            {isGeneratingAll ? 'Generating All...' : 'Generate All'}
          </button>
        </div>
      </header>

      <div className="settings-card" style={{ marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
        <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Project Name</label>
        <input 
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          style={{ width: '100%', padding: '0.6rem', marginTop: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', fontSize: '1.1rem', fontWeight: 'bold' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {paragraphs.map((p, idx) => (
          <div key={p.id} className="settings-card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>Paragraph {idx + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <UserCircle size={16} color="var(--accent)" />
                  <select 
                    value={p.voice} 
                    onChange={(e) => updateParagraph(p.id, 'voice', e.target.value)}
                    style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', fontSize: '0.85rem' }}
                  >
                    {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                  </select>
                </div>
                
                {p.text && (
                  <button 
                    onClick={() => generateParagraph(p.id)} 
                    disabled={p.isGenerating}
                    style={{ 
                      padding: '0.35rem 0.6rem', 
                      borderRadius: '6px', 
                      background: p.audioUrl ? 'rgba(99, 102, 241, 0.1)' : 'var(--text-main)', 
                      color: p.audioUrl ? 'var(--accent)' : 'var(--bg-dark)', 
                      border: p.audioUrl ? '1px solid var(--accent)' : 'none',
                      fontSize: '0.8rem', 
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {p.isGenerating ? 'Generating...' : p.audioUrl ? 'Regenerate' : 'Generate'}
                  </button>
                )}

                <button className="icon-btn" onClick={() => removeParagraph(p.id)} style={{ color: 'var(--danger-color)' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <textarea
              value={p.text}
              onChange={(e) => updateParagraph(p.id, 'text', e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', resize: 'vertical' }}
            />

            {p.audioUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                <audio src={p.audioUrl} controls style={{ flex: 1, height: '32px' }} />
                <a href={p.audioUrl} download={`paragraph_${idx + 1}.mp3`} className="icon-btn" style={{ padding: '0.25rem' }}>
                  <Download size={18} />
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <button 
        onClick={addParagraph}
        style={{ marginTop: '1rem', width: '100%', padding: '0.75rem', border: '2px dashed var(--border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.95rem' }}
      >
        <Plus size={18} /> Add Paragraph
      </button>
    </div>
  );
}
