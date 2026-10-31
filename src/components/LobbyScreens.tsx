import { useState } from 'react';
import { Users, LogIn, Plus } from 'lucide-react';
import '../App.css';

interface LobbyScreensProps {
  onHostGame: () => void;
  onJoinLobby: (code: string, name: string) => void;
  isHost: boolean;
  roomCode: string | null;
  players: { id: string; name: string }[];
  onStartHostGame: () => void;
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

  const handleHostClick = () => {
    onHostGame();
    setView('LOBBY');
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length === 4 && joinName.trim()) {
      onJoinLobby(joinCode.toUpperCase(), joinName.trim());
      setView('LOBBY');
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
        <h1 className="text-h1" style={{ color: 'var(--blue-dark)' }}>Join Room</h1>

        <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '320px' }}>
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
          <button
            type="submit"
            className="btn"
            disabled={joinCode.length !== 4 || !joinName.trim()}
            style={{
              backgroundColor: 'var(--blue)',
              borderBottomColor: 'var(--blue-dark)',
              marginTop: '8px'
            }}
          >
            JOIN
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', minHeight: '100px' }}>
            {players.length === 0 && (
              <div style={{ width: '100%', textAlign: 'center', color: 'var(--border-color)', fontWeight: 800, alignSelf: 'center' }}>
                Waiting for players...
              </div>
            )}
            {players.map((p, i) => (
              <div key={i} style={{
                backgroundColor: 'var(--blue-light)', color: 'var(--blue-dark)', fontWeight: 800,
                padding: '8px 16px', borderRadius: '100px', border: '2px solid var(--blue)',
                animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}>
                {p.name} {p.id === 'HOST' ? '(Host)' : ''}
              </div>
            ))}
          </div>
        </div>

        {isHost ? (
          <button
            className="btn"
            onClick={onStartHostGame}
            disabled={players.length < 1}
            style={{ width: '100%', maxWidth: '320px' }}
          >
            START GAME
          </button>
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
