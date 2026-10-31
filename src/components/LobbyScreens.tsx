import { useState, useRef, useEffect } from 'react';
import { Users, LogIn, Plus, Cat, Dog, Bird, Rabbit, Turtle, Snail, Search, Play, Square, X, Plus as PlusIcon } from 'lucide-react';
import fetchJsonp from 'fetch-jsonp';
import '../App.css';

interface Song {
  id: string;
  title: string;
  artist: string;
  movie: string;
  audioUrl: string;
  artwork: string;
}

const AVATARS = [
  { id: 'cat', icon: Cat, color: 'var(--orange)' },
  { id: 'dog', icon: Dog, color: 'var(--blue)' },
  { id: 'bird', icon: Bird, color: 'var(--green)' },
  { id: 'rabbit', icon: Rabbit, color: 'var(--purple)' },
  { id: 'turtle', icon: Turtle, color: 'var(--green-dark)' },
  { id: 'snail', icon: Snail, color: 'var(--red)' }
];

interface LobbyScreensProps {
  onHostGame: (avatar: string, name: string) => void;
  onJoinLobby: (code: string, name: string, avatar: string) => void;
  isHost: boolean;
  roomCode: string | null;
  players: { id: string; name: string; avatar?: string }[];
  onStartHostGame: (playlist: Song[]) => void;
}

export function LobbyScreens({
  onHostGame,
  onJoinLobby,
  isHost,
  roomCode,
  players,
  onStartHostGame
}: LobbyScreensProps) {

  const [view, setView] = useState<'HOME' | 'JOIN' | 'LOBBY'>('HOME');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('cat');
  const [isHostForm, setIsHostForm] = useState(false);

  // Host Playlist State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetchJsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&country=IN&entity=song&limit=10`);
      const data = await response.json();

      const mapped: Song[] = data.results
        .filter((r: any) => r.previewUrl)
        .map((r: any) => ({
          id: r.trackId.toString(),
          title: r.trackName,
          artist: r.artistName,
          movie: r.collectionName || '',
          audioUrl: r.previewUrl,
          artwork: r.artworkUrl100?.replace('100x100bb', '200x200bb') || ''
        }));
      setSearchResults(mapped);
    } catch (err) {
      console.error('Search failed', err);
    }
    setIsSearching(false);
  };

  const togglePreview = (url: string) => {
    if (playingPreview === url && audioRef.current) {
      audioRef.current.pause();
      setPlayingPreview(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.play().catch(e => console.error(e));
      audioRef.current = audio;
      setPlayingPreview(url);

      audio.onended = () => setPlayingPreview(null);
    }
  };

  const addToPlaylist = (song: Song) => {
    if (playlist.length >= 5) return;
    if (playlist.some(s => s.id === song.id)) return;
    setPlaylist([...playlist, song]);
  };

  const removeFromPlaylist = (id: string) => {
    setPlaylist(playlist.filter(s => s.id !== id));
  };

  const handleHostClick = () => {
    setIsHostForm(true);
    setView('JOIN'); // Use the join form to collect name/avatar for host too
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isHostForm) {
      if (joinName.trim()) {
        // Fix: Call onHostGame and DO NOT call onJoinLobby, which overwrites host state
        onHostGame(selectedAvatar, joinName.trim());
        setView('LOBBY');
      }
    } else {
      if (joinCode.length === 4 && joinName.trim()) {
        onJoinLobby(joinCode.toUpperCase(), joinName.trim(), selectedAvatar);
        setView('LOBBY');
      }
    }
  };

  if (view === 'HOME') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '96px', height: '96px', backgroundColor: 'var(--green)', borderRadius: '32px', color: 'white' }}>
          <Users size={56} />
        </div>
        <h1 className="text-h1" style={{ color: 'var(--green-dark)', textAlign: 'center' }}>Guess the Song</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '320px' }}>
          <button className="btn" onClick={handleHostClick} style={{ width: '100%', gap: '8px' }}>
            <Plus size={20} /> CREATE ROOM
          </button>

          <button
            className="btn"
            onClick={() => setView('JOIN')}
            style={{
              width: '100%',
              backgroundColor: 'var(--blue)',
              borderBottomColor: 'var(--blue-dark)',
              gap: '8px'
            }}
          >
            <LogIn size={20} /> JOIN ROOM
          </button>
        </div>
      </div>
    );
  }

  if (view === 'JOIN') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '20px' }}>
        <h1 className="text-h1" style={{ color: 'var(--blue-dark)' }}>
          {isHostForm ? 'Create Room' : 'Join Room'}
        </h1>

        <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '320px' }}>
          {!isHostForm && (
            <input
              type="text"
              placeholder="Room Code (4 letters)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
              style={{
                padding: '16px', borderRadius: '16px', border: '2px solid var(--border-color)',
                fontSize: '20px', fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', outline: 'none'
              }}
            />
          )}
          <input
            type="text"
            placeholder="Your Name"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value.slice(0, 15))}
            style={{
              padding: '16px', borderRadius: '16px', border: '2px solid var(--border-color)',
              fontSize: '20px', fontWeight: 800, textAlign: 'center', outline: 'none'
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ color: 'var(--text-muted)', fontWeight: 800, textAlign: 'center', fontSize: '14px' }}>Choose your avatar</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {AVATARS.map(avatar => {
                const Icon = avatar.icon;
                const isSelected = selectedAvatar === avatar.id;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '12px', borderRadius: '12px', cursor: 'pointer',
                      border: `2px solid ${isSelected ? avatar.color : 'var(--border-color)'}`,
                      backgroundColor: isSelected ? `${avatar.color}22` : 'white',
                      transition: 'all 0.2s', outline: 'none'
                    }}
                  >
                    <Icon size={32} color={isSelected ? avatar.color : 'var(--border-color)'} />
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="submit"
            className="btn"
            disabled={(!isHostForm && joinCode.length !== 4) || !joinName.trim()}
            style={{
              backgroundColor: isHostForm ? 'var(--green)' : 'var(--blue)',
              borderBottomColor: isHostForm ? 'var(--green-dark)' : 'var(--blue-dark)',
              marginTop: '8px'
            }}
          >
            {isHostForm ? 'CREATE' : 'JOIN'}
          </button>

          <button type="button" onClick={() => setView('HOME')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 800, cursor: 'pointer', marginTop: '16px', padding: '8px' }}>
            Cancel
          </button>
        </form>
      </div>
    );
  }

  if (view === 'LOBBY') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', padding: '40px 20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 className="text-h2" style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>ROOM CODE</h2>
          <div style={{
            fontSize: '56px', fontWeight: 900, letterSpacing: '8px', color: 'var(--green-dark)',
            backgroundColor: 'var(--green-light)', padding: '8px 32px', borderRadius: '24px'
          }}>
            {roomCode}
          </div>
        </div>

        <div style={{ width: '100%', backgroundColor: 'white', border: '2px solid var(--border-color)', borderRadius: '24px', padding: '24px' }}>
          <div style={{ fontWeight: 800, color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <span>PLAYERS</span>
            <span>{players.length} joined</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', minHeight: '100px', justifyContent: 'center' }}>
            {players.length === 0 && (
              <div style={{ width: '100%', textAlign: 'center', color: 'var(--border-color)', fontWeight: 800, alignSelf: 'center' }}>
                Waiting for players...
              </div>
            )}
            {players.map((p, i) => {
              const avatarObj = AVATARS.find(a => a.id === p.avatar) || AVATARS[1];
              const Icon = avatarObj.icon;
              return (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                  animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '32px',
                    backgroundColor: `${avatarObj.color}22`, border: `2px solid ${avatarObj.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon size={32} color={avatarObj.color} />
                  </div>
                  <div style={{ fontWeight: 800, color: 'var(--text-dark)', fontSize: '14px', textAlign: 'center', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name} {p.id === 'HOST' ? '(Host)' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {isHost ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ backgroundColor: 'white', border: '2px solid var(--border-color)', borderRadius: '24px', padding: '24px' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                <span>PLAYLIST</span>
                <span style={{ color: playlist.length === 5 ? 'var(--green-dark)' : 'var(--orange)' }}>
                  {playlist.length} / 5 songs
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', minHeight: '120px' }}>
                {playlist.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--border-color)', fontWeight: 800, padding: '20px' }}>
                    Search and add 5 songs to start.
                  </div>
                )}
                {playlist.map(song => (
                  <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', border: '2px solid var(--border-color)', borderRadius: '12px' }}>
                    <img src={song.artwork} style={{ width: '40px', height: '40px', borderRadius: '8px' }} alt="" />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>
                    </div>
                    <button onClick={() => removeFromPlaylist(song.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>
                      <X size={20} />
                    </button>
                  </div>
                ))}
              </div>

              {playlist.length < 5 && (
                <>
                  <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input
                      type="text"
                      placeholder="Search iTunes (e.g. A.R. Rahman)"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '2px solid var(--border-color)', outline: 'none', fontWeight: 700, fontSize: '16px' }}
                    />
                    <button type="submit" disabled={isSearching} style={{ backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: '12px', padding: '0 16px', cursor: 'pointer' }}>
                      <Search size={20} />
                    </button>
                  </form>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {searchResults.map(song => (
                      <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <button onClick={() => togglePreview(song.audioUrl)} style={{ background: 'var(--blue-light)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue-dark)', cursor: 'pointer' }}>
                          {playingPreview === song.audioUrl ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        </button>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>
                        </div>
                        <button
                          onClick={() => addToPlaylist(song)}
                          disabled={playlist.some(s => s.id === song.id)}
                          style={{ background: 'var(--green-light)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-dark)', cursor: playlist.some(s => s.id === song.id) ? 'default' : 'pointer', opacity: playlist.some(s => s.id === song.id) ? 0.3 : 1 }}
                        >
                          <PlusIcon size={16} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              className="btn"
              onClick={() => onStartHostGame(playlist)}
              disabled={players.length < 1 || playlist.length !== 5}
              style={{ width: '100%' }}
            >
              START GAME
            </button>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontWeight: 800, textAlign: 'center' }}>
            Waiting for host to start...
            <br/><span style={{ fontSize: '14px', fontWeight: 400 }}>Make sure your audio is unmuted.</span>
          </div>
        )}

        <style>{`
          @keyframes pop {
            0% { transform: scale(0.5); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return null;
}
