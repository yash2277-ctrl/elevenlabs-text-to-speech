import { Link, useLocation } from 'react-router-dom';
import { Mic, Radio, History as HistoryIcon, Music, Bot, ArrowRightLeft, Languages, Wand2, BookOpen, Type, Headphones, VolumeX, User, LogIn, Cpu } from 'lucide-react';

export default function Sidebar({ isLoggedIn, onLogout }) {
  const location = useLocation();

  const navSections = [
    {
      title: 'Generate',
      items: [
        { path: '/', label: 'Text to Speech', icon: <Radio size={18} /> },
        { path: '/speech-to-speech', label: 'Speech to Speech', icon: <ArrowRightLeft size={18} /> },
        { path: '/sound-effects', label: 'Sound Effects', icon: <Music size={18} /> },
        { path: '/music-generation', label: 'Music Generation', icon: <Headphones size={18} /> },
        { path: '/speech-to-text', label: 'Speech to Text', icon: <Type size={18} /> },
      ]
    },
    {
      title: 'Voice',
      items: [
        { path: '/voice-lab', label: 'Voice Cloning', icon: <Mic size={18} /> },
        { path: '/voice-design', label: 'Voice Design', icon: <Wand2 size={18} /> },
        { path: '/voice-isolator', label: 'Voice Isolator', icon: <VolumeX size={18} /> },
      ]
    },
    {
      title: 'Tools',
      items: [
        { path: '/dubbing', label: 'Dubbing', icon: <Languages size={18} /> },
        { path: '/projects', label: 'Projects', icon: <BookOpen size={18} /> },
        { path: '/agents', label: 'Conversational AI', icon: <Bot size={18} /> },
        { path: '/reader', label: 'Audio Reader', icon: <Headphones size={18} /> },
      ]
    },
    {
      title: null,
      items: [
        { path: '/history', label: 'History', icon: <HistoryIcon size={18} /> },
        { path: '/models', label: 'Models', icon: <Cpu size={18} /> },
      ]
    }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1><span className="logo-accent">|||</span> ElevenLabs</h1>
      </div>
      
      <nav className="sidebar-nav">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="nav-section">
            {section.title && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((item) => (
              <Link 
                key={item.label} 
                to={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      
      <div className="sidebar-footer">
        {isLoggedIn ? (
          <Link to="/account" className="user-profile" style={{ textDecoration: 'none' }}>
            <div className="avatar">U</div>
            <span>My Account</span>
          </Link>
        ) : (
          <Link to="/auth" className="user-profile" style={{ textDecoration: 'none' }}>
            <div className="avatar" style={{ background: 'var(--text-muted)' }}><LogIn size={16} /></div>
            <span>Sign In</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
