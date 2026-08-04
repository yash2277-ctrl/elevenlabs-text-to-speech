import { useState, useEffect } from 'react';
import { BookOpen, Play, Download, Plus, Volume2, Trash2 } from 'lucide-react';

export default function Reader() {
  const [articles, setArticles] = useState([]);
  const [voices, setVoices] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM');
  const [isCreating, setIsCreating] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);

  useEffect(() => {
    fetchVoices();
    fetchArticles();
  }, []);

  const fetchVoices = () => {
    fetch('http://localhost:8000/api/v1/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices) {
          setVoices(data.voices);
        }
      })
      .catch(err => console.error("Error fetching voices", err));
  };

  const fetchArticles = () => {
    fetch('http://localhost:8000/api/v1/reader/articles')
      .then(res => res.json())
      .then(data => {
        if (data.articles) setArticles(data.articles);
      })
      .catch(err => console.error("Error fetching articles", err));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title || !content) return;
    setIsCreating(true);

    try {
      const response = await fetch('http://localhost:8000/api/v1/reader/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, voice_id: selectedVoice })
      });

      if (!response.ok) throw new Error("Failed to create article");

      const result = await response.json();
      setTitle('');
      setContent('');
      setShowCreate(false);
      fetchArticles();
    } catch (error) {
      console.error(error);
      alert('Error creating article. Please ensure the backend is running.');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePlay = (article) => {
    if (!article.audio_url) return;
    if (currentAudio) {
      currentAudio.pause();
      if (playingId === article.article_id) {
        setPlayingId(null);
        setCurrentAudio(null);
        return;
      }
    }

    const audioUrl = `http://localhost:8000${article.audio_url}`;
    const audio = new Audio(audioUrl);
    audio.play().catch(e => console.error("Playback failed", e));
    setCurrentAudio(audio);
    setPlayingId(article.article_id);

    audio.onended = () => {
      setPlayingId(null);
      setCurrentAudio(null);
    };
  };

  const getVoiceName = (voiceId) => {
    const found = voices.find(v => v.voice_id === voiceId);
    return found ? found.name : voiceId;
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Audio Reader (Audio Native)</h2>
          <p>Convert articles and long-form content into natural-sounding audio.</p>
        </div>
        <button className="generate-btn" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} />
          {showCreate ? 'Cancel' : 'New Article'}
        </button>
      </header>

      {showCreate && (
        <form onSubmit={handleCreate} className="settings-card" style={{ marginBottom: '2rem' }}>
          <h3>Create Audio Article</h3>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Article title" required style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }} />
          </div>
          <div className="form-group">
            <label>Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="Write or paste your article content here..." required style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }} />
          </div>
          <div className="form-group">
            <label>Voice</label>
            <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)' }}>
              {voices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="generate-btn" disabled={isCreating}>
            {isCreating ? 'Generating Audio...' : 'Create & Generate Audio'}
          </button>
        </form>
      )}

      {articles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No articles yet. Click "New Article" to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {articles.map(article => (
            <div key={article.article_id} className="settings-card" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <BookOpen size={20} color="var(--accent)" />
                  <div>
                    <h4 style={{ margin: 0 }}>{article.title}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(article.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {article.audio_url && (
                    <>
                      <button
                        onClick={() => handlePlay(article)}
                        style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          backgroundColor: playingId === article.article_id ? 'var(--text-main)' : 'var(--accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: 'none', cursor: 'pointer'
                        }}
                      >
                        {playingId === article.article_id ? (
                          <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: 'var(--bg-dark)' }}></span>
                        ) : (
                          <Play size={16} fill="white" color="white" />
                        )}
                      </button>
                      <a href={`http://localhost:8000${article.audio_url}`} download className="icon-btn">
                        <Download size={18} />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
