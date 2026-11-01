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

export interface AnswerInfo {
  count: number;
  total: number;
  /** Who has locked in, and how many ms into the round they did */
  answered: { id: string; at: number }[];
  /** playerId -> option index; only present once the last quarter of the timer starts */
  picks?: Record<string, number>;
}

export interface RoundDetail {
  base: number;
  speed: number;
  streak: number;
  tMs: number;
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

/** Avatars that sit on the timer bar at the moment each player locked in an answer */
function AnswerMarkers({ answered, players, roundMs }: { answered: AnswerInfo['answered']; players: Player[]; roundMs: number }) {
  const placed: number[] = [];
  return (
    <div className="timer-markers">
      {[...answered].sort((a, b) => a.at - b.at).map(a => {
        const pos = Math.min(1, Math.max(0, 1 - a.at / roundMs)); // the bar drains right to left
        const level = placed.filter(p => Math.abs(p - pos) < 0.08).length;
        placed.push(pos);
        const player = players.find(p => p.id === a.id);
        return (
          <div key={a.id} className="timer-marker" style={{ left: `${pos * 100}%`, bottom: level * 32 }}>
            <Avatar id={player?.avatar} size={28} />
          </div>
        );
      })}
    </div>
  );
}

interface PlayingProps {
  round: RoundInfo;
  roundSeconds: number;
  total: number;
  timeLeft: number;
  /** 0..1 fraction of the round remaining */
  timeFrac: number;
  selected: number | null;
  playerId: string;
  players: Player[];
  score: number;
  streak: number;
  answerInfo: AnswerInfo | null;
  onAnswer: (idx: number) => void;
}

export function PlayingScreen({ round, roundSeconds, total, timeLeft, timeFrac, selected, playerId, players, score, streak, answerInfo, onAnswer }: PlayingProps) {
  const timerColor = timeFrac <= 0.33 ? 'var(--red)' : timeFrac <= 0.55 ? 'var(--yellow)' : 'var(--green)';
  const locked = selected !== null;
  const picks = answerInfo?.picks;

  // Other players' picks only appear once ~25% of the timer is left
  const pickersFor = (idx: number) =>
    picks
      ? Object.entries(picks)
          .filter(([id, choice]) => choice === idx && id !== playerId)
          .map(([id]) => players.find(p => p.id === id))
          .filter((p): p is Player => !!p)
      : [];

  return (
    <div className="page">
      <ProgressHeader roundNo={round.roundNo} total={total}>
        <StreakBadge streak={streak} />
        <XpBadge total={score} />
      </ProgressHeader>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '44px 0 24px' }}>
        <div className="timer-wrap">
          {answerInfo && <AnswerMarkers answered={answerInfo.answered} players={players} roundMs={roundSeconds * 1000} />}
          <div className="progress" style={{ height: '12px' }}>
            <div style={{ width: `${timeFrac * 100}%`, backgroundColor: timerColor, transition: 'width 0.1s linear, background-color 0.3s' }} />
          </div>
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
          {locked
            ? `Locked in! Waiting for others${answerInfo ? ` (${answerInfo.count}/${answerInfo.total})` : '…'}`
            : picks ? 'Everyone’s picks are showing!' : ''}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {round.options.map((opt, i) => {
          const pickers = pickersFor(i);
          return (
            <button
              key={i}
              className={`answer-card ${selected === i ? 'selected' : ''} ${selected !== null && selected !== i ? 'dim' : ''}`}
              onClick={() => onAnswer(i)}
              disabled={locked}
            >
              <span className="key">{i + 1}</span>
              <span style={{ flex: 1 }}>{opt}</span>
              {pickers.length > 0 && (
                <span className="pickers">
                  {pickers.slice(0, 5).map(p => <Avatar key={p.id} id={p.avatar} size={26} />)}
                  {pickers.length > 5 && <span className="more">+{pickers.length - 5}</span>}
                </span>
              )}
            </button>
          );
        })}
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
  detail?: RoundDetail;
  streak: number;
  correctPlayers: Player[];
  onContinue: () => void;
}

export function RevealScreen({ roundNo, total, isHost, selected, correctIndex, options, song, score, earned, detail, streak, correctPlayers, onContinue }: RevealProps) {
  const answered = selected !== null;
  const isCorrect = selected === correctIndex;
  const tone: 'correct' | 'wrong' = isCorrect ? 'correct' : 'wrong';

  useEffect(() => {
    if (isCorrect) {
      playCorrectTone();
      const t = window.setTimeout(() => playCoinTone(Math.min(5, Math.max(3, Math.round(earned / 250)))), 700);
      return () => clearTimeout(t);
    }
    if (answered) {
      playWrongTone();
      vibrate([120, 60, 120]);
    }
  }, [isCorrect, answered, earned]);

  const answerText = options[correctIndex];

  return (
    <div className={`page reveal--${tone}`}>
      {tone === 'correct' && <><div className="screen-flash correct" /><Confetti /></>}
      {tone === 'wrong' && <div className="screen-flash wrong" />}

      <ProgressHeader roundNo={roundNo + 1} total={total}>
        <StreakBadge streak={streak} grow={isCorrect && streak >= 3} />
        <XpBadge total={score} earned={earned} delay={500} />
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
            backgroundColor: isCorrect ? 'var(--green)' : 'var(--red)',
            animation: 'pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.2s both'
          }}>
            {isCorrect ? <Check size={30} strokeWidth={4} /> : <X size={30} strokeWidth={4} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="text-h2" style={{ fontSize: '24px', color: isCorrect ? 'var(--green-text)' : 'var(--red-text)' }}>
              {isCorrect ? 'Excellent!' : answered ? 'Not quite' : "Time's up!"}
            </h2>
            <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
              {isCorrect && detail
                ? `Answered in ${(detail.tMs / 1000).toFixed(1)}s. Faster answers score more.`
                : isCorrect ? 'Nice one, you nailed it' : 'Better luck on the next song'}
            </div>
          </div>
        </div>

        {(earned > 0 || streak >= 2) && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {earned > 0 && <span className="earned-pill"><Zap size={18} fill="currentColor" /> +{earned} XP</span>}
            {streak >= 2 && <span className="streak-pill"><Flame size={18} fill="currentColor" /> {streak} in a row</span>}
          </div>
        )}
        {detail && earned > 0 && (
          <div className="breakdown">
            <span>Base {detail.base}</span>
            <span className="speed">Speed +{detail.speed}</span>
            {detail.streak > 0 && <span className="streakb">Streak +{detail.streak}</span>}
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
