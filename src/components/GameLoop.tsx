import { useState, useEffect, useRef } from 'react';
import { playCorrectTone, playWrongTone } from '../utils/audio';
import songsData from '../data/songs.json';
import { Music, Zap, Flame, Trophy } from 'lucide-react';
import { LobbyScreens } from './LobbyScreens';
import RealtimeAdapter from '../utils/realtime';
import '../App.css';

type GameState = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'REVEAL' | 'LEADERBOARD' | 'END';

interface Song {
  id: string;
  title: string;
  artist: string;
  movie: string;
  audioUrl: string;
  artwork: string;
}

interface Round {
  songId: string;
  options: string[];
  type: 'title' | 'artist';
  startAt: number;
}

interface Player {
  id: string;
  name: string;
}

function GameLoop() {
  // Network & Roles
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [adapter, setAdapter] = useState<RealtimeAdapter | null>(null);

  // Game State
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentRoundNo, setCurrentRoundNo] = useState(0);
  const totalRounds = 5;

  // Round Data (Client)
  const [currentRoundData, setCurrentRoundData] = useState<Round | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState<number | null>(null);

  // Reveal Data
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [roundScores, setRoundScores] = useState<Record<string, number>>({});
  const [roundStreaks, setRoundStreaks] = useState<Record<string, number>>({});

  // Refs for loop management
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const hostStateRef = useRef({
    rounds: [] as { song: Song, options: string[], type: 'title'|'artist' }[],
    answersThisRound: new Map<string, { optionIndex: number, tMs: number }>(),
    scores: {} as Record<string, number>,
    streaks: {} as Record<string, number>
  });

  // ---------------- LOBBY & NETWORK ----------------

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleHostGame = () => {
    const code = generateRoomCode();
    setIsHost(true);
    setRoomCode(code);
    const pid = 'HOST';
    setPlayerId(pid);

    const newAdapter = new RealtimeAdapter(code);
    setAdapter(newAdapter);

    // Host joins their own room implicitly
    setPlayers([{ id: pid, name: 'You' }]);
  };

  const handleJoinLobby = (code: string, name: string) => {
    setIsHost(false);
    setRoomCode(code);
    const pid = `P_${Math.random().toString(36).substr(2, 9)}`;
    setPlayerId(pid);

    const newAdapter = new RealtimeAdapter(code);
    setAdapter(newAdapter);

    // Resume audio context on user gesture (Join click)
    new (window.AudioContext || (window as any).webkitAudioContext)().resume();

    // Tell host we joined
    setTimeout(() => {
      newAdapter.broadcast('join', { playerId: pid, name });
    }, 500); // slight delay to ensure channel is open
  };

  useEffect(() => {
    if (!adapter) return;

    const handleJoin = (payload: any) => {
      if (isHost) {
        setPlayers(prev => {
          if (prev.find(p => p.id === payload.playerId)) return prev;
          const newPlayers = [...prev, { id: payload.playerId, name: payload.name }];

          // Host needs to keep players scores tracked
          hostStateRef.current.scores[payload.playerId] = 0;
          hostStateRef.current.streaks[payload.playerId] = 0;

          // In a real app we'd broadcast the updated roster back,
          // but for this spike, players don't strictly need to see everyone else until leaderboard.
          return newPlayers;
        });
      }
    };

    const handleGameStart = () => {
      setGameState('COUNTDOWN');
    };

    const handleRoundStart = (payload: any) => {
      setCurrentRoundData(payload);
      setCurrentRoundNo(payload.roundNo);
      setGameState('COUNTDOWN');
    };

    const handleAnswer = (payload: any) => {
      if (isHost && gameState === 'PLAYING') {
        hostStateRef.current.answersThisRound.set(payload.playerId, {
          optionIndex: payload.optionIndex,
          tMs: payload.tMs
        });
      }
    };

    const handleRoundEnd = (payload: any) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) audioRef.current.pause();

      setCorrectIndex(payload.correctIndex);
      setRoundScores(payload.scores);
      setRoundStreaks(payload.streaks);

      // Play sound locally based on if we got it right
      if (playerId !== 'HOST') { // host doesn't play
        if (selectedAnswerIdx === payload.correctIndex) {
          playCorrectTone();
        } else {
          playWrongTone();
        }
      }

      setGameState('REVEAL');
    };

    const handleFinal = (payload: any) => {
      setRoundScores(payload.scores);
      setGameState('END');
    };

    adapter.on('join', handleJoin);
    adapter.on('game_start', handleGameStart);
    adapter.on('round_start', handleRoundStart);
    adapter.on('answer', handleAnswer);
    adapter.on('round_end', handleRoundEnd);
    adapter.on('final', handleFinal);

    return () => {
      adapter.cleanup();
    };
  }, [adapter, isHost, gameState, selectedAnswerIdx, playerId]);

  // ---------------- HOST LOGIC ----------------

  const hostStartGame = () => {
    // Generate rounds
    const shuffledSongs = [...songsData].sort(() => 0.5 - Math.random());
    const selectedSongs = shuffledSongs.slice(0, totalRounds) as Song[];

    const rounds = selectedSongs.map(song => {
      const type = Math.random() > 0.5 ? 'title' : 'artist';
      const correctText = type === 'title' ? song.title : song.artist;
      const distractors = songsData
        .filter(s => s.id !== song.id)
        .map(s => type === 'title' ? s.title : s.artist)
        .filter((value, index, self) => self.indexOf(value) === index);

      const shuffledDistractors = distractors.sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [...shuffledDistractors, correctText].sort(() => 0.5 - Math.random());

      return { song, options, type: type as 'title' | 'artist' };
    });

    hostStateRef.current.rounds = rounds;
    hostStateRef.current.scores = {};
    hostStateRef.current.streaks = {};
    players.forEach(p => {
      hostStateRef.current.scores[p.id] = 0;
      hostStateRef.current.streaks[p.id] = 0;
    });

    adapter?.broadcast('game_start', {});
    hostStartRound(1);
  };

  const hostStartRound = (roundNo: number) => {
    const roundData = hostStateRef.current.rounds[roundNo - 1];
    hostStateRef.current.answersThisRound.clear();

    const payload = {
      roundNo,
      songId: roundData.song.id,
      options: roundData.options,
      type: roundData.type,
      startAt: Date.now() + 3000 // 3 sec countdown
    };

    adapter?.broadcast('round_start', payload);

    // Host also acts as a client visually
    setCurrentRoundData(payload as any);
    setCurrentRoundNo(roundNo);
    setGameState('COUNTDOWN');
  };

  const hostEvaluateRound = () => {
    const roundData = hostStateRef.current.rounds[currentRoundNo - 1];
    const correctText = roundData.type === 'title' ? roundData.song.title : roundData.song.artist;
    const correctIndex = roundData.options.indexOf(correctText);

    // Calculate scores
    players.forEach(p => {
      if (p.id === 'HOST') return; // Host doesn't score

      const answer = hostStateRef.current.answersThisRound.get(p.id);
      if (answer && answer.optionIndex === correctIndex) {
        // Correct
        const timeBonus = Math.max(0, (15000 - answer.tMs) / 15000 * 600);
        const streak = hostStateRef.current.streaks[p.id] || 0;
        const streakBonus = Math.min(streak * 50, 250);
        const earned = Math.floor(400 + timeBonus + streakBonus);

        hostStateRef.current.scores[p.id] += earned;
        hostStateRef.current.streaks[p.id] += 1;
      } else {
        // Wrong or no answer
        hostStateRef.current.streaks[p.id] = 0;
      }
    });

    const payload = {
      correctIndex,
      scores: hostStateRef.current.scores,
      streaks: hostStateRef.current.streaks
    };

    adapter?.broadcast('round_end', payload);

    // Host local update
    setCorrectIndex(correctIndex);
    setRoundScores(hostStateRef.current.scores);
    setRoundStreaks(hostStateRef.current.streaks);
    setGameState('REVEAL');
  };

  const hostNextStep = () => {
    if (gameState === 'REVEAL') {
      setGameState('LEADERBOARD');
    } else if (gameState === 'LEADERBOARD') {
      if (currentRoundNo < totalRounds) {
        hostStartRound(currentRoundNo + 1);
      } else {
        adapter?.broadcast('final', { scores: hostStateRef.current.scores });
        setGameState('END');
      }
    }
  };

  // ---------------- CLIENT LOGIC ----------------

  // Countdown & Audio Start Sync
  useEffect(() => {
    if (gameState === 'COUNTDOWN' && currentRoundData) {
      let count = 3;
      const interval = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(interval);
          setGameState('PLAYING');
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState, currentRoundData]);

  // Playing phase & Timer
  useEffect(() => {
    if (gameState === 'PLAYING' && currentRoundData) {
      setTimeLeft(15);
      setSelectedAnswerIdx(null);
      setCorrectIndex(null);

      // Find song URL from local DB (in a real app, URL might be broadcasted or fetched)
      const song = songsData.find(s => s.id === currentRoundData.songId);

      if (song && playerId !== 'HOST') { // Host doesn't play audio
        const audio = new Audio(song.audioUrl);
        audio.play().catch(e => console.error("Audio blocked:", e));
        audioRef.current = audio;
      }

      // Start timer
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const left = Math.max(0, 15 - Math.floor(elapsed));
        setTimeLeft(left);

        if (left === 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (isHost) {
            hostEvaluateRound();
          } else if (selectedAnswerIdx === null) {
            // Auto-submit empty if time runs out and no answer
            handleClientAnswer(-1, 15000);
          }
        }
      }, 250); // check 4x a sec for accuracy

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (audioRef.current) audioRef.current.pause();
      };
    }
  }, [gameState, currentRoundData, isHost]);

  const handleClientAnswer = (idx: number, tMs?: number) => {
    if (gameState !== 'PLAYING' || isHost) return;
    if (selectedAnswerIdx !== null) return; // already answered

    setSelectedAnswerIdx(idx);

    if (audioRef.current) {
      // fade out or pause immediately
      audioRef.current.pause();
    }

    const timeToAnswer = tMs !== undefined ? tMs : (15 - timeLeft) * 1000;

    adapter?.broadcast('answer', {
      playerId,
      optionIndex: idx,
      tMs: timeToAnswer
    });
  };

  // ---------------- RENDERERS ----------------

  if (!roomCode || gameState === 'LOBBY') {
    return (
      <LobbyScreens
        isHost={isHost}
        roomCode={roomCode}
        players={players}
        onHostGame={handleHostGame}
        onJoinLobby={handleJoinLobby}
        onStartHostGame={hostStartGame}
      />
    );
  }

  const myScore = roundScores[playerId] || 0;
  const myStreak = roundStreaks[playerId] || 0;

  const renderCountdown = () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1 className="text-h1" style={{ fontSize: '80px', animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
        Ready
      </h1>
    </div>
  );

  const renderPlaying = () => {
    if (!currentRoundData) return null;
    if (isHost) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 className="text-h2">Round {currentRoundNo}</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: '24px', margin: '20px 0' }}>Time Left: {timeLeft}s</div>
          <div style={{ width: '80%', height: '16px', backgroundColor: 'var(--border-color)', borderRadius: '8px' }}>
          <div style={{ height: '100%', width: `${(timeLeft / 15) * 100}%`, backgroundColor: 'var(--blue)', transition: 'width 0.25s linear' }} />
          </div>
          <button className="btn" onClick={hostEvaluateRound} style={{ marginTop: '40px' }}>Force End Round</button>
        </div>
      )
    }

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {/* Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontWeight: 800, color: 'var(--text-muted)' }}>Round {currentRoundNo}/{totalRounds}</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--orange)', fontWeight: 800 }}>
              <Flame size={20} fill={myStreak >= 3 ? "currentColor" : "none"} /> {myStreak}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--yellow)', fontWeight: 800 }}>
              <Zap size={20} fill="currentColor" /> {myScore}
            </div>
          </div>
        </div>

        {/* Timer Bar */}
        <div style={{ height: '16px', backgroundColor: 'var(--border-color)', borderRadius: '8px', overflow: 'hidden', marginBottom: '32px' }}>
          <div style={{
            height: '100%',
          width: `${(timeLeft / 15) * 100}%`,
            backgroundColor: timeLeft <= 5 ? 'var(--red)' : 'var(--green)',
            transition: 'width 0.25s linear, background-color 0.3s'
          }} />
        </div>

        {/* Question Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '32px' }}>
           <div style={{ width: '120px', height: '120px', borderRadius: '50%', backgroundColor: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', marginBottom: '24px', animation: 'pulse 1.5s infinite' }}>
              <Music size={48} />
           </div>
           <h2 className="text-h2" style={{ textAlign: 'center' }}>
             Guess the {currentRoundData.type === 'title' ? 'Song' : 'Artist'}!
           </h2>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {currentRoundData.options.map((opt, i) => (
            <button
              key={i}
            className={`answer-card ${selectedAnswerIdx === i ? 'selected' : ''}`}
              onClick={() => handleClientAnswer(i)}
              disabled={selectedAnswerIdx !== null}
              style={{ textAlign: 'left', opacity: (selectedAnswerIdx !== null && selectedAnswerIdx !== i) ? 0.6 : 1 }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                border: '2px solid', borderColor: selectedAnswerIdx === i ? 'var(--blue)' : 'var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, color: selectedAnswerIdx === i ? 'var(--blue-dark)' : 'var(--text-muted)'
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>{opt}</div>
            </button>
          ))}
        </div>
      </div>
    );
};

const renderReveal = () => {
  if (!currentRoundData) return null;
  const isCorrect = selectedAnswerIdx === correctIndex;
  const song = songsData.find(s => s.id === currentRoundData.songId);

  if (isHost) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <h2 className="text-h2">Time's Up!</h2>
        <div style={{ margin: '20px 0', textAlign: 'center' }}>
          <div style={{ fontWeight: 800, color: 'var(--text-muted)' }}>Correct Answer:</div>
          <div style={{ fontSize: '24px', color: 'var(--green-dark)', fontWeight: 900 }}>{currentRoundData.options[correctIndex!]}</div>
        </div>
        <button className="btn" onClick={hostNextStep}>Show Leaderboard</button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', maxWidth: '600px', margin: '0 auto', width: '100%', position: 'relative', overflow: 'hidden' }}>
      <div style={{ opacity: 0.5, pointerEvents: 'none', display: 'flex', flexDirection: 'column', height: '100%' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ fontWeight: 800 }}>Round {currentRoundNo}</div>
         </div>
         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
          {currentRoundData.options.map((opt, i) => {
            let stateClass = '';
            if (i === correctIndex) stateClass = 'correct';
            else if (i === selectedAnswerIdx && !isCorrect) stateClass = 'wrong';

            return (
              <div key={i} className={`answer-card ${stateClass}`}>
                <div style={{ flex: 1 }}>{opt}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: isCorrect ? 'var(--green-light)' : 'var(--red-light)',
        padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
        display: 'flex', flexDirection: 'column', gap: '16px',
        animation: 'slideUp 0.3s ease-out',
        borderTop: `2px solid ${isCorrect ? 'var(--green)' : 'var(--red)'}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="text-h2" style={{ color: isCorrect ? 'var(--green-dark)' : 'var(--red-dark)' }}>
              {isCorrect ? 'Excellent!' : 'Incorrect'}
            </h2>
            {!isCorrect && <div style={{ color: 'var(--red-dark)', fontWeight: 800 }}>Correct: {currentRoundData.options[correctIndex!]}</div>}
          </div>
          {song && <img src={song.artwork} alt="album art" style={{ width: '64px', height: '64px', borderRadius: '12px' }} />}
        </div>
        <div style={{ color: 'var(--text-muted)', fontWeight: 800, textAlign: 'center', marginTop: '8px' }}>
          Waiting for Host...
        </div>
      </div>
    </div>
  );
};

const renderLeaderboard = () => {
  // Sort players by score
  const sortedPlayers = players
    .filter(p => p.id !== 'HOST')
    .map(p => ({ ...p, score: roundScores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
      <h2 className="text-h2" style={{ marginBottom: '32px' }}>Leaderboard</h2>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sortedPlayers.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 24px', backgroundColor: p.id === playerId ? 'var(--blue-light)' : 'white',
            border: `2px solid ${p.id === playerId ? 'var(--blue)' : 'var(--border-color)'}`,
            borderRadius: '16px', fontWeight: 800,
            animation: `slideIn 0.3s ease-out ${i * 0.1}s both`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '32px', color: 'var(--text-muted)' }}>#{i + 1}</div>
              <div style={{ fontSize: '18px', color: p.id === playerId ? 'var(--blue-dark)' : 'var(--text-dark)' }}>
                {p.name} {p.id === playerId ? '(You)' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--yellow)' }}>
              <Zap size={20} fill="currentColor" /> {p.score}
            </div>
          </div>
        ))}
      </div>

      {isHost && (
        <button className="btn" onClick={hostNextStep} style={{ marginTop: 'auto', width: '100%' }}>
          {currentRoundNo < totalRounds ? 'NEXT ROUND' : 'FINISH GAME'}
        </button>
      )}
      {!isHost && (
        <div style={{ marginTop: 'auto', color: 'var(--text-muted)', fontWeight: 800 }}>
          Waiting for Host...
        </div>
      )}
    </div>
  );
};

const renderEnd = () => {
  const sortedPlayers = players
    .filter(p => p.id !== 'HOST')
    .map(p => ({ ...p, score: roundScores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = sortedPlayers[0];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '20px' }}>
      <Trophy size={80} color="var(--yellow)" style={{ animation: 'bounce 2s infinite' }} />
      <h1 className="text-h1" style={{ color: 'var(--yellow)' }}>Game Over!</h1>

      {winner && (
        <div style={{ backgroundColor: '#fff', border: '2px solid var(--yellow)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '400px', textAlign: 'center', margin: '20px 0' }}>
          <div style={{ color: 'var(--text-muted)', fontWeight: 800, marginBottom: '8px' }}>WINNER</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-dark)' }}>{winner.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--yellow)', fontSize: '32px', fontWeight: 900, marginTop: '8px' }}>
            <Zap size={32} fill="currentColor" /> {winner.score}
          </div>
        </div>
      )}

      {isHost && (
        <button className="btn" onClick={() => window.location.reload()} style={{ width: '100%', maxWidth: '400px' }}>
          BACK TO HOME
        </button>
      )}
    </div>
  );
};

return (
  <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)' }}>
    {gameState === 'COUNTDOWN' && renderCountdown()}
    {gameState === 'PLAYING' && renderPlaying()}
    {gameState === 'REVEAL' && renderReveal()}
    {gameState === 'LEADERBOARD' && renderLeaderboard()}
    {gameState === 'END' && renderEnd()}

    <style>{`
      @keyframes slideIn {
        from { transform: translateX(20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    `}</style>
  </div>
);
}

export default GameLoop;