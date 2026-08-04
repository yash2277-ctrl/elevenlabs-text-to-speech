import { useState, useEffect } from 'react';
import { Download, Play, Trash2, Volume2, Mic, Music } from 'lucide-react';

export default function History() {
  const [history, setHistory] = useState([]);
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);

  useEffect(() => {
    // Fetch voices to map voice_ids to names
    fetch('http://localhost:8000/api/v1/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices) setVoices(data.voices);
      })
      .catch(err => console.error("Error fetching voices", err));

    fetchHistory();
  }, []);

  const fetchHistory = () => {
    setLoading(true);
    fetch('http://localhost:8000/api/v1/history')
      .then(res => res.json())
      .then(data => {
        if (data.history) setHistory(data.history);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching history", err);
        setLoading(false);
      });
  };

  const getVoiceName = (voiceId, genType) => {
    if (genType === 'sfx') return 'Sound Effect';
    const found = voices.find(v => v.voice_id === voiceId);
    return found ? found.name : voiceId;
  };

  const getIcon = (genType) => {
    if (genType === 'sfx') return <Music size={16} />;
    if (genType === 'sts') return <Mic size={16} />;
    return <Volume2 size={16} />;
  };

  const handlePlay = (item) => {
    if (currentAudio) {
      currentAudio.pause();
      if (playingId === item.id) {
        setPlayingId(null);
        setCurrentAudio(null);
        return;
      }
    }

    const audioUrl = `http://localhost:8000/api/v1/audio/${item.audio_file_path}`;
    const audio = new Audio(audioUrl);
    audio.play().catch(e => console.error("Playback failed", e));
    setCurrentAudio(audio);
    setPlayingId(item.id);

    audio.onended = () => {
      setPlayingId(null);
      setCurrentAudio(null);
    };
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this history item?")) return;
    try {
      const response = await fetch(`http://localhost:8000/api/v1/history/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (error) {
      console.error("Error deleting history item", error);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>History</h2>
        <p>Your generated audio files are saved here.</p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading history...</div>
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No generations found. Start creating!</div>
      ) : (
        <div className="history-table-container" style={{ backgroundColor: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: '500' }}>Type / Voice</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: '500' }}>Text / Prompt</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: '500' }}>Date</th>
                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: '500', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: playingId === item.id ? 'var(--bg-hover)' : 'transparent' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handlePlay(item)}
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          backgroundColor: playingId === item.id ? 'var(--text-main)' : 'var(--accent)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {playingId === item.id ? (
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: 'var(--bg-dark)' }}></span>
                        ) : (
                          <Play size={14} fill="white" color="white" />
                        )}
                      </button>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem' }}>
                        {getIcon(item.gen_type)}
                        {getVoiceName(item.voice_id, item.gen_type)}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }}>
                    {item.text}
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <a 
                      href={`http://localhost:8000/api/v1/audio/${item.audio_file_path}`} 
                      download 
                      className="icon-btn" 
                      style={{ marginRight: '0.75rem', display: 'inline-flex', verticalAlign: 'middle' }}
                    >
                      <Download size={18} />
                    </a>
                    <button 
                      onClick={() => handleDelete(item.id)} 
                      className="icon-btn" 
                      style={{ color: 'var(--danger-color)', display: 'inline-flex', verticalAlign: 'middle', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
