import { useState, useRef } from 'react';
import fetchJsonp from 'fetch-jsonp';
import { Play, Square, Music, HardDrive } from 'lucide-react';
import './App.css';

interface iTunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl: string;
  artworkUrl100: string;
}

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<iTunesResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<number | string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const searchItunes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setResults([]);

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&country=IN&entity=song&limit=15`;
      const response = await fetchJsonp(url, {
        timeout: 5000,
      });
      const data = await response.json();

      const songsWithPreviews = data.results.filter((item: any) => item.previewUrl);
      setResults(songsWithPreviews);
    } catch (error) {
      console.error("iTunes search failed:", error);
      alert("Search failed. Check console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = (id: number | string, previewUrl: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.play().catch(e => {
      console.error("Audio playback failed", e);
      alert("Autoplay might be blocked by the browser. Try interacting with the page first.");
      setPlayingId(null);
    });

    setPlayingId(id);

    audio.addEventListener('ended', () => {
      setPlayingId(null);
    });
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

      <div style={{ textAlign: 'center' }}>
        <h1 className="text-h1" style={{ color: 'var(--green-dark)' }}>Guess the Song</h1>
        <p className="text-body" style={{ color: 'var(--text-muted)' }}>Phase 0 Feasibility Spike</p>
      </div>

      <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '16px', border: '2px solid var(--border-color)' }}>
        <h2 className="text-h2" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Music size={28} color="var(--blue)" />
          Option A: iTunes API Test
        </h2>

        <form onSubmit={searchItunes} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <input
            type="text"
            placeholder="Search Tamil or 2000s era songs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: '2px solid var(--border-color)',
              fontSize: '17px',
              fontFamily: 'inherit',
              outline: 'none'
            }}
          />
          <button type="submit" className="btn" disabled={isLoading || !searchTerm.trim()}>
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {results.length === 0 && !isLoading && searchTerm && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
              No results found with audio previews.
            </div>
          )}

          {results.map((song) => (
            <div key={song.trackId} className="answer-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', overflow: 'hidden' }}>
                <img
                  src={song.artworkUrl100}
                  alt="album art"
                  style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover' }}
                />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {song.trackName}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {song.artistName}
                  </div>
                </div>
              </div>

              <button
                onClick={() => togglePlay(song.trackId, song.previewUrl)}
                style={{
                  background: playingId === song.trackId ? 'var(--blue)' : 'var(--border-color)',
                  color: playingId === song.trackId ? 'white' : 'var(--text-dark)',
                  border: 'none',
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {playingId === song.trackId ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '4px' }}/>}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '16px', border: '2px solid var(--border-color)' }}>
        <h2 className="text-h2" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HardDrive size={28} color="var(--purple)" />
          Option B: Local Clip Test
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '15px' }}>
          Testing playback of locally hosted clips (simulating custom cut 15-second audio).
        </p>

        <div className="answer-card" style={{ display: 'flex', justifyContent: 'space-between', borderColor: 'var(--purple)' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '8px', backgroundColor: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Music size={32} />
            </div>
            <div>
              <div style={{ fontWeight: 800 }}>Dummy Local Audio</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Option B test</div>
            </div>
          </div>

          <button
            onClick={() => togglePlay('local-dummy', '/dummy.mp3')}
            style={{
              background: playingId === 'local-dummy' ? 'var(--purple)' : 'var(--border-color)',
              color: playingId === 'local-dummy' ? 'white' : 'var(--text-dark)',
              border: 'none',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {playingId === 'local-dummy' ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '4px' }}/>}
          </button>
        </div>
      </div>

    </div>
  );
}

export default App;
