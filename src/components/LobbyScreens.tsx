import { useState } from 'react';
import { Users, LogIn, Plus, Cat, Dog, Bird, Rabbit, Turtle, Snail } from 'lucide-react';
import '../App.css';

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
  const [selectedAvatar, setSelectedAvatar] = useState('cat');
  const [isHostForm, setIsHostForm] = useState(false);

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
