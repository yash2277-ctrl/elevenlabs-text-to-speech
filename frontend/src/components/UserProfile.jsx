import { useState, useEffect } from 'react';
import { User, CreditCard, Key, LogOut, BarChart3 } from 'lucide-react';

export default function UserProfile({ onLogout }) {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/user');
      if (response.ok) {
        const data = await response.json();
        setUserInfo(data);
      }
    } catch (error) {
      console.error("Error fetching user info", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    if (onLogout) onLogout();
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        Loading profile...
      </div>
    );
  }

  const sub = userInfo?.subscription || { tier: 'free', character_count: 0, character_limit: 10000, voice_limit: 10 };
  const usagePercent = sub.character_limit > 0 ? Math.round((sub.character_count / sub.character_limit) * 100) : 0;

  return (
    <div className="page-container" style={{ maxWidth: '700px' }}>
      <header className="page-header">
        <h2>Account & Subscription</h2>
        <p>Manage your account settings and view usage.</p>
      </header>

      <div className="settings-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={28} color="white" />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>{userInfo?.email || 'User Account'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
              {sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1)} Plan
            </p>
          </div>
        </div>

        <button onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <div className="settings-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <BarChart3 size={20} color="var(--accent)" /> Usage
        </h3>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Characters Used</span>
            <span style={{ fontWeight: '600' }}>{sub.character_count?.toLocaleString()} / {sub.character_limit?.toLocaleString()}</span>
          </div>
          <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--bg-hover)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(usagePercent, 100)}%`, height: '100%', borderRadius: '4px', background: usagePercent > 80 ? '#ef4444' : 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.25rem' }}>Voice Limit</p>
            <p style={{ fontWeight: '700', fontSize: '1.2rem', margin: 0 }}>{sub.voice_limit || '∞'}</p>
          </div>
          <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.25rem' }}>API Key</p>
            <p style={{ fontWeight: '700', fontSize: '0.9rem', margin: 0, fontFamily: 'monospace' }}>
              {userInfo?.xi_api_key || 'Not set'}
            </p>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <CreditCard size={20} color="var(--accent)" /> Subscription Plans
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          {[
            { name: 'Free', price: '$0', chars: '10,000/mo', voices: '10' },
            { name: 'Starter', price: '$5', chars: '30,000/mo', voices: '30' },
            { name: 'Pro', price: '$99', chars: '500,000/mo', voices: 'Unlimited' },
          ].map(plan => (
            <div key={plan.name} style={{
              padding: '1rem', borderRadius: '8px', border: plan.name === (sub.tier === 'free' ? 'Free' : 'Pro') ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: plan.name === (sub.tier === 'free' ? 'Free' : 'Pro') ? 'rgba(99,102,241,0.1)' : 'var(--bg-input)', textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.25rem' }}>{plan.name}</h4>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', margin: '0.25rem 0' }}>{plan.price}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0' }}>{plan.chars}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>{plan.voices} voices</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
