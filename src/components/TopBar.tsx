import { useState } from 'react';
import { Moon, Sun, X } from 'lucide-react';
import { useTheme } from '../utils/theme';

interface TopBarProps {
  /** Show the exit button (only once the player is in a room) */
  inRoom: boolean;
  isHost: boolean;
  onExit: () => void;
}

export function TopBar({ inRoom, isHost, onExit }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="app-bar">
        {inRoom ? (
          <button className="icon-btn" aria-label="Exit game" title="Exit game" onClick={() => setConfirming(true)}>
            <X size={22} strokeWidth={3} />
          </button>
        ) : <span />}

        <button
          className="icon-btn"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={toggle}
        >
          {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
        </button>
      </div>

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2 className="text-h2">{isHost ? 'End the game?' : 'Leave the game?'}</h2>
            <p className="text-body" style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>
              {isHost ? 'Everyone in the room will be sent home.' : 'You will lose your score in this game.'}
            </p>
            <button className="btn" onClick={() => setConfirming(false)}>Keep playing</button>
            <button className="btn gray" style={{ color: 'var(--red-text)' }} onClick={() => { setConfirming(false); onExit(); }}>
              {isHost ? 'End game' : 'Leave'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
