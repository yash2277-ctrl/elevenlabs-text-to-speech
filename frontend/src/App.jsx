import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import SpeechSynthesis from './components/SpeechSynthesis';
import VoiceLab from './components/VoiceLab';
import SoundEffects from './components/SoundEffects';
import History from './components/History';
import ConversationalAI from './components/ConversationalAI';
import SpeechToSpeech from './components/SpeechToSpeech';
import Dubbing from './components/Dubbing';
import VoiceDesign from './components/VoiceDesign';
import Projects from './components/Projects';
import SpeechToText from './components/SpeechToText';
import MusicGeneration from './components/MusicGeneration';
import VoiceIsolator from './components/VoiceIsolator';
import Reader from './components/Reader';
import Auth from './components/Auth';
import UserProfile from './components/UserProfile';
import Models from './components/Models';
import './index.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('access_token'));

  const handleLogin = () => setIsLoggedIn(true);
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <div className="app-container">
        <Sidebar isLoggedIn={isLoggedIn} onLogout={handleLogout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<SpeechSynthesis />} />
            <Route path="/speech-to-speech" element={<SpeechToSpeech />} />
            <Route path="/sound-effects" element={<SoundEffects />} />
            <Route path="/music-generation" element={<MusicGeneration />} />
            <Route path="/speech-to-text" element={<SpeechToText />} />
            <Route path="/voice-lab" element={<VoiceLab />} />
            <Route path="/voice-design" element={<VoiceDesign />} />
            <Route path="/voice-isolator" element={<VoiceIsolator />} />
            <Route path="/dubbing" element={<Dubbing />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/agents" element={<ConversationalAI />} />
            <Route path="/reader" element={<Reader />} />
            <Route path="/history" element={<History />} />
            <Route path="/auth" element={<Auth onLogin={handleLogin} />} />
            <Route path="/account" element={<UserProfile onLogout={handleLogout} />} />
            <Route path="/models" element={<Models />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
