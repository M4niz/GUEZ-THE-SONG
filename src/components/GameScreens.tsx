import { useEffect } from 'react';
import { Check, Flame, Music, Trophy, X, Zap } from 'lucide-react';
import { Avatar } from './Avatar';
import { Confetti, StreakBadge, XpBadge } from './Effects';
import type { Row } from '../utils/ranking';
import { playCoinTone, playCorrectTone, playWrongTone, vibrate } from '../utils/audio';

export interface Player {
  id: string;
  name: string;
  avatar?: string;
}

export interface RoundInfo {
  roundNo: number;
  options: string[];
  type: 'title' | 'artist';
}

export interface RevealSong {
  title: string;
  artist: string;
  artwork: string;
}

function ProgressHeader({ roundNo, total, children }: { roundNo: number; total: number; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
      <div className="progress"><div style={{ width: `${((roundNo - 1) / total) * 100}%` }} /></div>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

// ---------------- Countdown ----------------

export function CountdownScreen({ count }: { count: number }) {
  return (
    <div className="page page-center">
      <div key={count} className="text-h1" style={{ fontSize: '96px', color: 'var(--green-text)', animation: 'pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
        {count > 0 ? count : 'Go!'}
      </div>
      <div className="text-body" style={{ color: 'var(--text-muted)' }}>Get ready to listen…</div>
    </div>
  );
}

// ---------------- Playing ----------------

interface PlayingProps {
  round: RoundInfo;
  total: number;
  timeLeft: number;
  /** 0..1 fraction of the round remaining */
  timeFrac: number;
  selected: number | null;
  isHost: boolean;
  score: number;
  streak: number;
  answered: { count: number; total: number } | null;
  onAnswer: (idx: number) => void;
}

export function PlayingScreen({ round, total, timeLeft, timeFrac, selected, isHost, score, streak, answered, onAnswer }: PlayingProps) {
  const timerColor = timeLeft <= 5 ? 'var(--red)' : timeLeft <= 8 ? 'var(--yellow)' : 'var(--green)';
  const locked = selected !== null || isHost;

  return (
    <div className="page">
      <ProgressHeader roundNo={round.roundNo} total={total}>
        {!isHost && <StreakBadge streak={streak} />}
        {!isHost && <XpBadge total={score} />}
      </ProgressHeader>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div className="progress" style={{ height: '12px' }}>
          <div style={{ width: `${timeFrac * 100}%`, backgroundColor: timerColor, transition: 'width 0.1s linear, background-color 0.3s' }} />
        </div>
        <div style={{ width: '28px', textAlign: 'right', fontWeight: 900, color: timerColor }}>{timeLeft}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
        <div className="speaker"><Music size={48} /></div>
        <div className="eq" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <h2 className="text-h2" style={{ textAlign: 'center' }}>
          Guess the {round.type === 'title' ? 'song' : 'artist'}!
        </h2>
        <div className="text-body" style={{ color: 'var(--text-muted)', minHeight: '24px', textAlign: 'center' }}>
          {isHost
            ? `You're hosting · ${answered?.count ?? 0}/${answered?.total ?? 0} answered`
            : selected !== null
              ? `Locked in! Waiting for others${answered ? ` (${answered.count}/${answered.total})` : '…'}`
              : ''}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {round.options.map((opt, i) => (
          <button
            key={i}
            className={`answer-card ${selected === i ? 'selected' : ''} ${selected !== null && selected !== i ? 'dim' : ''}`}
            onClick={() => onAnswer(i)}
            disabled={locked}
          >
            <span className="key">{i + 1}</span>
            <span style={{ flex: 1 }}>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- Reveal ----------------

interface RevealProps {
  roundNo: number;
  total: number;
  isHost: boolean;
  selected: number | null;
  correctIndex: number;
  options: string[];
  song: RevealSong | null;
  score: number;
  earned: number;
  streak: number;
  correctPlayers: Player[];
  respondents: number;
  onContinue: () => void;
}

export function RevealScreen({ roundNo, total, isHost, selected, correctIndex, options, song, score, earned, streak, correctPlayers, respondents, onContinue }: RevealProps) {
  const answered = selected !== null;
  const isCorrect = !isHost && selected === correctIndex;
  const tone: 'correct' | 'wrong' | 'neutral' = isHost ? 'neutral' : isCorrect ? 'correct' : 'wrong';

  useEffect(() => {
    if (isHost) return;
    if (isCorrect) {
      playCorrectTone();
      const t = window.setTimeout(() => playCoinTone(Math.min(5, Math.max(3, Math.round(earned / 250)))), 700);
      return () => clearTimeout(t);
    }
    if (answered) {
      playWrongTone();
      vibrate([120, 60, 120]);
    }
  }, [isHost, isCorrect, answered, earned]);

  const answerText = options[correctIndex];

  return (
    <div className={`page reveal--${tone}`}>
      {tone === 'correct' && <><div className="screen-flash correct" /><Confetti /></>}
      {tone === 'wrong' && <div className="screen-flash wrong" />}

      <ProgressHeader roundNo={roundNo + 1} total={total}>
        {!isHost && <StreakBadge streak={streak} grow={isCorrect && streak >= 3} />}
        {!isHost && <XpBadge total={score} earned={earned} delay={500} />}
      </ProgressHeader>

      {/* The answer sits in the middle of the screen */}
      <div className="reveal-stage">
        {song?.artwork
          ? <img className="reveal-art" src={song.artwork} alt="Album art" />
          : <div className="reveal-art" />}
        <div>
          <div className="field-label" style={{ marginBottom: '10px' }}>Correct answer</div>
          <div className="answer-banner">{answerText}</div>
        </div>
        {song && (
          <div className="text-body" style={{ color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
            {song.title} · {song.artist}
          </div>
        )}
        {correctPlayers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="field-label" style={{ margin: 0 }}>Got it</span>
            {correctPlayers.slice(0, 6).map(p => <Avatar key={p.id} id={p.avatar} size={32} />)}
            {correctPlayers.length > 6 && <span style={{ fontWeight: 800 }}>+{correctPlayers.length - 6}</span>}
          </div>
        )}
      </div>

      <div className={`sheet ${tone}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%', flex: 'none', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: tone === 'correct' ? 'var(--green)' : tone === 'wrong' ? 'var(--red)' : 'var(--blue)',
            animation: 'pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.2s both'
          }}>
            {tone === 'correct' ? <Check size={30} strokeWidth={4} /> : tone === 'wrong' ? <X size={30} strokeWidth={4} /> : <Trophy size={26} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="text-h2" style={{ fontSize: '24px', color: tone === 'correct' ? 'var(--green-text)' : tone === 'wrong' ? 'var(--red-text)' : 'var(--text-dark)' }}>
              {isHost ? 'Round results' : isCorrect ? 'Excellent!' : answered ? 'Not quite' : "Time's up!"}
            </h2>
            <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
              {isHost
                ? `${correctPlayers.length} of ${respondents} got it right`
                : isCorrect ? 'Nice one, you nailed it' : 'Better luck on the next song'}
            </div>
          </div>
        </div>

        {!isHost && (earned > 0 || streak >= 2) && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {earned > 0 && <span className="earned-pill"><Zap size={18} fill="currentColor" /> +{earned} XP</span>}
            {streak >= 2 && <span className="streak-pill"><Flame size={18} fill="currentColor" /> {streak} in a row</span>}
          </div>
        )}

        {isHost ? (
          <button className="btn" onClick={onContinue}>Continue</button>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontWeight: 800, textAlign: 'center' }}>Waiting for host…</div>
        )}
      </div>
    </div>
  );
}

// ---------------- Leaderboard ----------------

interface LeaderboardProps {
  rows: Row[];
  playerId: string;
  isHost: boolean;
  isLastRound: boolean;
  onNext: () => void;
}

export function LeaderboardScreen({ rows, playerId, isHost, isLastRound, onNext }: LeaderboardProps) {
  return (
    <div className="page">
      <h2 className="text-h2" style={{ textAlign: 'center', margin: '8px 0 24px' }}>Leaderboard</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rows.map((p, i) => {
          const me = p.id === playerId;
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px',
              backgroundColor: me ? 'var(--blue-light)' : 'var(--surface)',
              border: `2px solid ${me ? 'var(--blue)' : 'var(--border-color)'}`,
              borderRadius: '16px', fontWeight: 800,
              animation: `slideIn 0.3s ease-out ${i * 0.1}s both`
            }}>
              <div style={{ width: '28px', color: i === 0 ? 'var(--yellow)' : 'var(--text-muted)', fontWeight: 900 }}>{i + 1}</div>
              <Avatar id={p.avatar} size={40} />
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: me ? 'var(--blue-text)' : 'var(--text-dark)' }}>
                {p.name}{me ? ' (You)' : ''}
              </div>
              {p.streak >= 2 && <span className="stat streak hot" style={{ fontSize: '15px' }}><Flame size={18} fill="currentColor" />{p.streak}</span>}
              <span className="stat xp" style={{ fontSize: '17px' }}><Zap size={18} fill="currentColor" /> {p.score}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '24px', textAlign: 'center' }}>
        {isHost ? (
          <button className="btn" onClick={onNext} style={{ width: '100%' }}>{isLastRound ? 'Finish game' : 'Next round'}</button>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontWeight: 800 }}>Waiting for host…</div>
        )}
      </div>
    </div>
  );
}

// ---------------- End / podium ----------------

const PODIUM = [
  { place: 1, height: 170, color: 'var(--yellow)' },
  { place: 2, height: 125, color: '#A7B5BE' },
  { place: 3, height: 95, color: 'var(--orange)' }
];

export function EndScreen({ rows, playerId, onHome }: { rows: Row[]; playerId: string; onHome: () => void }) {
  // visual order: 2nd, 1st, 3rd
  const slots = [rows[1], rows[0], rows[2]].map((row, i) => ({ row, ...PODIUM[[1, 0, 2][i]] }));
  const iWon = rows[0]?.id === playerId;

  return (
    <div className="page page-center" style={{ gap: '20px' }}>
      <Confetti count={iWon ? 70 : 36} />
      <Trophy size={64} color="var(--yellow)" style={{ animation: 'bounce 2s infinite' }} />
      <h1 className="text-h1" style={{ color: 'var(--yellow)' }}>Game over!</h1>

      {rows.length === 0 ? (
        <div className="text-body" style={{ color: 'var(--text-muted)' }}>Nobody played this round.</div>
      ) : (
        <div className="podium">
          {slots.map(({ row, place, height, color }) => (
            <div key={place} className="slot" style={{ visibility: row ? 'visible' : 'hidden' }}>
              {row && <>
                <Avatar id={row.avatar} size={place === 1 ? 64 : 52} />
                <div className="name">{row.name}{row.id === playerId ? ' (You)' : ''}</div>
                <span className="stat xp" style={{ fontSize: '16px' }}><Zap size={16} fill="currentColor" /> {row.score}</span>
              </>}
              <div className="bar" style={{ height, backgroundColor: color, animationDelay: `${(4 - place) * 0.25}s` }}>{place}</div>
            </div>
          ))}
        </div>
      )}

      <button className="btn" onClick={onHome} style={{ width: '100%', maxWidth: '400px' }}>Back to home</button>
    </div>
  );
}

// ---------------- Host left ----------------

export function HostLeftScreen({ onHome }: { onHome: () => void }) {
  return (
    <div className="page page-center">
      <div className="text-h1">The host left</div>
      <div className="text-body" style={{ color: 'var(--text-muted)' }}>This game has ended.</div>
      <button className="btn" onClick={onHome} style={{ width: '100%', maxWidth: '320px' }}>Back to home</button>
    </div>
  );
}
