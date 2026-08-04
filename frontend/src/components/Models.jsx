import { useState, useEffect } from 'react';
import { Cpu, ArrowRight, Check } from 'lucide-react';

const MODEL_CATEGORIES = {
  "eleven_monolingual_v1": { category: "Speech", badge: "Standard" },
  "eleven_multilingual_v2": { category: "Speech", badge: "Multilingual" },
  "eleven_turbo_v2": { category: "Speech", badge: "Low Latency" },
  "eleven_english_sts_v2": { category: "Voice Conversion", badge: "STS" },
  "scribe_v2": { category: "Transcription", badge: "STT" },
  "eleven_music_v1": { category: "Music", badge: "Audio" },
};

export default function Models() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/models')
      .then(res => res.json())
      .then(data => {
        setModels(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching models", err);
        setLoading(false);
      });
  }, []);

  const grouped = models.reduce((acc, m) => {
    const info = MODEL_CATEGORIES[m.model_id] || { category: "Other", badge: "" };
    if (!acc[info.category]) acc[info.category] = [];
    acc[info.category].push({ ...m, badge: info.badge });
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        Loading models...
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '700px' }}>
      <header className="page-header">
        <h2>Available Models</h2>
        <p>Explore the AI models powering your voice generation.</p>
      </header>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>{category}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map(model => (
              <div key={model.model_id} className="settings-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Cpu size={20} color="var(--accent)" />
                  <div>
                    <p style={{ fontWeight: '600', margin: 0 }}>{model.name}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.15rem 0 0' }}>{model.description}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {model.badge && (
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: '600' }}>
                      {model.badge}
                    </span>
                  )}
                  <Check size={16} color="var(--accent)" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
