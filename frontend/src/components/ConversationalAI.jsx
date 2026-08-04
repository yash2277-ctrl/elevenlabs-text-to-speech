import { useState, useEffect } from 'react';
import { Phone, Webhook, Play, MessageSquare, Plus, UserCircle } from 'lucide-react';

export default function ConversationalAI() {
  const [activeTab, setActiveTab] = useState('configuration');
  const [voices, setVoices] = useState([]);
  const [agents, setAgents] = useState([]);
  
  // New Agent Form
  const [agentName, setAgentName] = useState('Support Bot');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful customer support agent.');
  const [firstMessage, setFirstMessage] = useState('Hello! How can I help you today?');
  const [selectedVoice, setSelectedVoice] = useState('');

  // Selected Agent / Deployment
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeployingPhone, setIsDeployingPhone] = useState(false);
  const [widgetEmbedCode, setWidgetEmbedCode] = useState('');

  useEffect(() => {
    // Fetch voices
    fetch('http://localhost:8000/api/v1/voices')
      .then(res => res.json())
      .then(data => {
        if (data.voices) {
          setVoices(data.voices);
          if (data.voices.length > 0) setSelectedVoice(data.voices[0].voice_id);
        }
      })
      .catch(err => console.error("Error fetching voices", err));

    // Fetch agents
    fetchAgents();
  }, []);

  const fetchAgents = () => {
    fetch('http://localhost:8000/api/v1/agents')
      .then(res => res.json())
      .then(data => {
        if (data.agents) {
          setAgents(data.agents);
          if (data.agents.length > 0 && !selectedAgent) {
            setSelectedAgent(data.agents[0]);
          }
        }
      })
      .catch(err => console.error("Error fetching agents", err));
  };

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const response = await fetch('http://localhost:8000/api/v1/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          system_prompt: systemPrompt,
          first_message: firstMessage,
          voice_id: selectedVoice
        })
      });

      if (!response.ok) throw new Error("Failed to create agent");

      const newAgent = await response.json();
      alert(`Agent "${newAgent.name}" created successfully!`);
      fetchAgents();
      setSelectedAgent(newAgent);
    } catch (error) {
      console.error(error);
      alert('Error creating agent. Please ensure the backend is running.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeployToPhone = async () => {
    if (!selectedAgent) return;
    setIsDeployingPhone(true);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/agents/${selectedAgent.agent_id}/deploy/phone`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error("Failed to deploy to phone");

      const result = await response.json();
      setSelectedAgent(prev => ({ ...prev, phone_number: result.phone_number }));
      // Update agent in local list
      setAgents(prev => prev.map(a => a.agent_id === selectedAgent.agent_id ? { ...a, phone_number: result.phone_number } : a));
      alert(`Phone number provisioned successfully: ${result.phone_number}`);
    } catch (error) {
      console.error(error);
      alert('Error deploying to phone number.');
    } finally {
      setIsDeployingPhone(false);
    }
  };

  const handleGetWidget = async () => {
    if (!selectedAgent) return;
    try {
      const response = await fetch(`http://localhost:8000/api/v1/agents/${selectedAgent.agent_id}/deploy/widget`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error("Failed to fetch widget");
      const result = await response.json();
      setWidgetEmbedCode(result.embed_code);
    } catch (error) {
      console.error(error);
      alert('Error generating widget embed code.');
    }
  };

  useEffect(() => {
    if (selectedAgent) {
      handleGetWidget();
    } else {
      setWidgetEmbedCode('');
    }
  }, [selectedAgent]);

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>Conversational AI (Agents)</h2>
        <p>Deploy AI voice agents to WebSockets, Phone Numbers, or your website.</p>
      </header>

      <div className="tabs" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '2rem' }}>
        <button 
          className={`tab-btn ${activeTab === 'configuration' ? 'active' : ''}`}
          onClick={() => setActiveTab('configuration')}
          style={{ padding: '0.5rem 0', background: 'none', border: 'none', borderBottom: activeTab === 'configuration' ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === 'configuration' ? 'var(--text-color)' : 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Configuration
        </button>
        <button 
          className={`tab-btn ${activeTab === 'deploy' ? 'active' : ''}`}
          onClick={() => setActiveTab('deploy')}
          style={{ padding: '0.5rem 0', background: 'none', border: 'none', borderBottom: activeTab === 'deploy' ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === 'deploy' ? 'var(--text-color)' : 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Deploy
        </button>
      </div>

      {activeTab === 'configuration' && (
        <div className="two-col-layout">
          <div className="left-panel">
            <form onSubmit={handleCreateAgent} className="settings-card">
              <h3>Create Voice Agent</h3>
              
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Agent Name</label>
                <input 
                  type="text" 
                  value={agentName} 
                  onChange={(e) => setAgentName(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>System Prompt</label>
                <textarea 
                  rows={4} 
                  value={systemPrompt} 
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>First Message</label>
                <input 
                  type="text" 
                  value={firstMessage} 
                  onChange={(e) => setFirstMessage(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Select Agent Voice</label>
                <select 
                  value={selectedVoice} 
                  onChange={e => setSelectedVoice(e.target.value)} 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-color)', marginTop: '0.5rem' }}
                >
                  {voices.map(v => (
                    <option key={v.voice_id} value={v.voice_id}>{v.name} ({v.labels?.accent || 'premade'})</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="generate-btn" style={{ width: '100%', marginTop: '1rem' }} disabled={isCreating}>
                {isCreating ? 'Creating Agent...' : 'Create & Save Agent'}
              </button>
            </form>
          </div>

          <div className="right-panel">
            <div className="settings-card">
              <h3>Active Agents</h3>
              {agents.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>No agents created yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                  {agents.map(a => (
                    <div 
                      key={a.agent_id} 
                      onClick={() => setSelectedAgent(a)}
                      style={{ 
                        padding: '0.75rem', 
                        borderRadius: '6px', 
                        border: selectedAgent?.agent_id === a.agent_id ? '1px solid var(--accent)' : '1px solid var(--border)', 
                        background: selectedAgent?.agent_id === a.agent_id ? 'var(--bg-hover)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: '600' }}>{a.name}</span>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {a.agent_id}</p>
                      </div>
                      {a.phone_number && <span style={{ fontSize: '0.75rem', background: 'rgba(0,255,128,0.1)', color: '#00ff80', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>Phone Live</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {selectedAgent && (
              <div className="settings-card" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem' }}>
                 <div 
                   onClick={() => alert(`Starting voice session with agent "${selectedAgent.name}"... Greeting: "${selectedAgent.first_message || 'Hello!'}"`)}
                   style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                 >
                   <Play fill="white" size={40} />
                 </div>
                 <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>Test: {selectedAgent.name}</p>
                 <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.2rem' }}>
                   Click to start an interactive WebSocket audio test session in your browser.
                 </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'deploy' && (
        <div>
          {!selectedAgent ? (
            <div className="settings-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>Please create or select an agent in the Configuration tab first.</p>
            </div>
          ) : (
            <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              
              <div className="settings-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Phone size={24} color="var(--accent)" />
                  <h3 style={{ margin: 0 }}>Deploy to Phone Number</h3>
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  Connect <strong>{selectedAgent.name}</strong> to a real phone number. Customers can call and speak directly to your AI.
                </p>
                
                {selectedAgent.phone_number ? (
                  <div style={{ padding: '1rem', background: 'rgba(0, 255, 128, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 255, 128, 0.3)', textAlign: 'center' }}>
                    <h2 style={{ color: '#00ff80' }}>{selectedAgent.phone_number}</h2>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status: Active and listening.</p>
                  </div>
                ) : (
                  <button 
                    className="generate-btn" 
                    onClick={handleDeployToPhone} 
                    disabled={isDeployingPhone}
                    style={{ width: '100%' }}
                  >
                    {isDeployingPhone ? 'Provisioning via Twilio...' : 'Buy & Connect Number'}
                  </button>
                )}
              </div>

              <div className="settings-card">
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <MessageSquare size={24} color="var(--accent)" />
                  <h3 style={{ margin: 0 }}>Web Widget</h3>
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  Embed a voice-enabled chat widget for <strong>{selectedAgent.name}</strong> directly on your website.
                </p>
                <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                  {widgetEmbedCode || 'Generating embed code...'}
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
