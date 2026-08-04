import { useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function VoiceLab() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !name) return alert('Name and File are required');

    setIsUploading(true);
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('files', file);

    try {
      const response = await fetch('http://localhost:8000/api/v1/voices/add', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("Upload failed");
      
      alert("Voice cloned successfully!");
      setName('');
      setDescription('');
      setFile(null);
    } catch (error) {
      alert("Error uploading voice. Did you set your API key?");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <h2>VoiceLab</h2>
        <p>Clone your voice instantly by uploading a short audio sample.</p>
      </header>

      <div className="voicelab-card">
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label>Name your voice</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Custom Voice" required />
          </div>

          <div className="form-group">
            <label>Description (Optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="How would you describe this voice?" rows={3} />
          </div>

          <div className="form-group">
            <label>Upload Audio Sample (.wav, .mp3)</label>
            <div className="upload-box">
              <UploadCloud size={40} className="upload-icon" />
              <input type="file" accept="audio/*" onChange={e => setFile(e.target.files[0])} required />
              {file && <p className="file-name">{file.name}</p>}
            </div>
          </div>

          <button type="submit" className="generate-btn" disabled={isUploading}>
            {isUploading ? 'Cloning...' : 'Add Voice'}
          </button>
        </form>
      </div>
    </div>
  );
}
