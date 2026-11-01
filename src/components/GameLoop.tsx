import { useState, useEffect, useRef } from 'react';
import { LobbyScreens } from './LobbyScreens';
import { TopBar } from './TopBar';
import {
  CountdownScreen, PlayingScreen, RevealScreen, LeaderboardScreen, EndScreen, HostLeftScreen
} from './GameScreens';
import type { Player, RevealSong, RoundInfo } from './GameScreens';
import { rankPlayers } from '../utils/ranking';
import RealtimeAdapter from '../utils/realtime';
import { unlockAudio } from '../utils/audio';
import {
  ANSWER_GRACE_MS, COUNTDOWN_MS, MAX_PLAYERS, ROUND_MS, ROUND_SECONDS, TOTAL_ROUNDS, buildRounds
} from '../utils/songs';
import type { HostRound, Song } from '../utils/songs';

type GameState = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'REVEAL' | 'LEADERBOARD' | 'END';

const HOST_ID = 'HOST';

interface ActiveRound extends RoundInfo {
  /** Host wall-clock time (ms) at which the clip starts and the timer begins */
  startAt: number;
}

interface HostState {
  rounds: HostRound[];
  roundNo: number;
  started: boolean;
  roundOpen: boolean;
  startAt: number;
  answers: Map<string, { optionIndex: number; tMs: number }>;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  evalTimeout: number | null;
}

const freshHostState = (): HostState => ({
  rounds: [], roundNo: 0, started: false, roundOpen: false, startAt: 0,
  answers: new Map(), scores: {}, streaks: {}, evalTimeout: null
});

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

function GameLoop() {
  // Network & roles
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [adapter, setAdapter] = useState<RealtimeAdapter | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hostLeft, setHostLeft] = useState(false);

  // Game state
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [players, setPlayers] = useState<Player[]>([]);
  const [totalRounds, setTotalRounds] = useState(TOTAL_ROUNDS);
  const [currentRound, setCurrentRound] = useState<ActiveRound | null>(null);
  const [currentSong, setCurrentSong] = useState<{ audioUrl: string } | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [timeFrac, setTimeFrac] = useState(1);
  const [selectedAnswerIdx, setSelectedAnswerIdx] = useState<number | null>(null);
  const [answerProgress, setAnswerProgress] = useState<{ count: number; total: number } | null>(null);

  // Reveal data
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [earned, setEarned] = useState<Record<string, number>>({});
  const [revealSong, setRevealSong] = useState<RevealSong | null>(null);
  const [correctIds, setCorrectIds] = useState<string[]>([]);

  // Refs: everything timers and network callbacks need lives here so they never read stale state
  const adapterRef = useRef<RealtimeAdapter | null>(null);
  const roleRef = useRef({ isHost: false, playerId: '' });
  const playersRef = useRef<Player[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hostRef = useRef<HostState>(freshHostState());
  const clockRef = useRef({ offset: 0, bestRtt: Infinity }); // hostTime - localTime
  const joinTimerRef = useRef<number | null>(null);
  const pingTimersRef = useRef<number[]>([]);
  const evaluateRef = useRef<() => void>(() => {}); // host round-evaluation, set by the handlers effect

  const clearSessionTimers = () => {
    if (hostRef.current.evalTimeout) clearTimeout(hostRef.current.evalTimeout);
    if (joinTimerRef.current) clearInterval(joinTimerRef.current);
    pingTimersRef.current.forEach(clearTimeout);
    pingTimersRef.current = [];
    joinTimerRef.current = null;
  };

  // ---------------- SESSION ----------------

  const exitGame = (message: string | null = null, announce = true) => {
    const ad = adapterRef.current;
    if (ad && announce) {
      if (roleRef.current.isHost) ad.broadcast('host_left', {});
      else ad.broadcast('leave', { playerId: roleRef.current.playerId });
    }
    clearSessionTimers();
    audioRef.current?.pause();
    hostRef.current = freshHostState();
    playersRef.current = [];
    clockRef.current = { offset: 0, bestRtt: Infinity };
    adapterRef.current = null;
    roleRef.current = { isHost: false, playerId: '' };

    setAdapter(null);
    setIsHost(false);
    setRoomCode(null);
    setPlayerId('');
    setGameState('LOBBY');
    setPlayers([]);
    setTotalRounds(TOTAL_ROUNDS);
    setCurrentRound(null);
    setCurrentSong(null);
    setSelectedAnswerIdx(null);
    setAnswerProgress(null);
    setCorrectIndex(null);
    setScores({});
    setStreaks({});
    setEarned({});
    setRevealSong(null);
    setCorrectIds([]);
    setHostLeft(false);
    setNotice(message);
    setSessionKey(k => k + 1); // remounts the lobby so it starts at HOME
  };

  const startSession = (code: string, pid: string, host: boolean) => {
    const newAdapter = new RealtimeAdapter(code);
    adapterRef.current = newAdapter;
    roleRef.current = { isHost: host, playerId: pid };
    // Must run inside the click that created/joined the room
    audioRef.current = unlockAudio();

    setNotice(null);
    setIsHost(host);
    setRoomCode(code);
    setPlayerId(pid);
    setAdapter(newAdapter);
    return newAdapter;
  };

  const commitPlayers = (list: Player[]) => {
    playersRef.current = list;
    setPlayers(list);
    adapterRef.current?.broadcast('roster_update', { players: list });
  };

  const handleHostGame = (avatar: string, name: string) => {
    hostRef.current = freshHostState();
    startSession(generateRoomCode(), HOST_ID, true);
    const me = { id: HOST_ID, name, avatar };
    playersRef.current = [me];
    setPlayers([me]);
  };

  const handleJoinLobby = (code: string, name: string, avatar: string) => {
    const pid = `P_${Math.random().toString(36).slice(2, 11)}`;
    const newAdapter = startSession(code, pid, false);
    clockRef.current = { offset: 0, bestRtt: Infinity };

    const sendJoin = () => newAdapter.broadcast('join', { playerId: pid, name, avatar });
    const sendPing = () => newAdapter.broadcast('time_ping', { playerId: pid, t0: Date.now() });

    newAdapter.on('system_connected', () => {
      sendJoin();
      sendPing();
      pingTimersRef.current = [1000, 2500].map(ms => window.setTimeout(sendPing, ms));

      // Retry the join a few times; if the host never answers the room doesn't exist
      let attempts = 0;
      joinTimerRef.current = window.setInterval(() => {
        attempts += 1;
        if (attempts >= 4) {
          exitGame('Room not found. Check the code and try again.', false);
        } else {
          sendJoin();
        }
      }, 2500);
    });
  };

  // ---------------- NETWORK HANDLERS ----------------

  useEffect(() => {
    if (!adapter) return;

    const hs = () => hostRef.current;
    const activePlayers = () => playersRef.current.filter(p => p.id !== HOST_ID);

    const applyRoundEnd = (payload: any) => {
      audioRef.current?.pause();
      setCorrectIndex(payload.correctIndex);
      setScores(payload.scores);
      setStreaks(payload.streaks);
      setEarned(payload.earned ?? {});
      setRevealSong(payload.song ?? null);
      setCorrectIds(payload.correctPlayers ?? []);
      setGameState('REVEAL');
    };

    // ----- host side -----

    const evaluateRound = () => {
      const h = hs();
      if (!h.roundOpen) return;
      h.roundOpen = false;
      if (h.evalTimeout) clearTimeout(h.evalTimeout);
      h.evalTimeout = null;

      const round = h.rounds[h.roundNo - 1];
      const earnedNow: Record<string, number> = {};
      const correctPlayers: string[] = [];

      activePlayers().forEach(p => {
        const answer = h.answers.get(p.id);
        if (answer && answer.optionIndex === round.correctIndex) {
          const streak = (h.streaks[p.id] || 0) + 1;
          const timeBonus = Math.max(0, ((ROUND_MS - answer.tMs) / ROUND_MS) * 600);
          const streakBonus = Math.min(streak * 50, 250);
          const points = Math.floor(400 + timeBonus + streakBonus);
          h.scores[p.id] = (h.scores[p.id] || 0) + points;
          h.streaks[p.id] = streak;
          earnedNow[p.id] = points;
          correctPlayers.push(p.id);
        } else {
          h.streaks[p.id] = 0;
          earnedNow[p.id] = 0;
        }
      });

      const payload = {
        correctIndex: round.correctIndex,
        scores: { ...h.scores },
        streaks: { ...h.streaks },
        earned: earnedNow,
        correctPlayers,
        song: { title: round.song.title, artist: round.song.artist, artwork: round.song.artwork }
      };
      adapter.broadcast('round_end', payload);
      applyRoundEnd(payload); // the host never receives its own broadcast
    };

    const checkAllAnswered = () => {
      const h = hs();
      if (!h.roundOpen) return;
      const total = activePlayers().length;
      const count = activePlayers().filter(p => h.answers.has(p.id)).length;
      const progress = { count, total };
      setAnswerProgress(progress);
      adapter.broadcast('answer_progress', progress);
      // Everyone is in: end the round shortly instead of waiting out the timer
      if (total > 0 && count >= total) window.setTimeout(evaluateRound, 800);
    };

    const handleJoin = (p: any) => {
      if (!isHost || !p?.playerId || p.playerId === HOST_ID) return;
      const list = playersRef.current;
      if (list.some(x => x.id === p.playerId)) {
        adapter.broadcast('roster_update', { players: list }); // lets a retrying joiner in
        return;
      }
      if (hs().started) {
        adapter.broadcast('join_rejected', { playerId: p.playerId, reason: 'That game has already started.' });
        return;
      }
      if (list.length >= MAX_PLAYERS) {
        adapter.broadcast('join_rejected', { playerId: p.playerId, reason: 'That room is full.' });
        return;
      }
      hs().scores[p.playerId] = 0;
      hs().streaks[p.playerId] = 0;
      commitPlayers([...list, { id: p.playerId, name: String(p.name ?? 'Player').slice(0, 15), avatar: p.avatar }]);
    };

    const handleLeave = (p: any) => {
      if (!isHost || !p?.playerId) return;
      if (!playersRef.current.some(x => x.id === p.playerId)) return;
      commitPlayers(playersRef.current.filter(x => x.id !== p.playerId));
      checkAllAnswered();
    };

    const handleAnswer = (p: any) => {
      if (!isHost) return;
      const h = hs();
      if (!h.roundOpen || h.answers.has(p?.playerId)) return;
      if (!activePlayers().some(x => x.id === p.playerId)) return;
      const round = h.rounds[h.roundNo - 1];
      const idx = Number(p.optionIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= round.options.length) return;

      // Time is measured by the host on arrival, so a client can't claim a faster answer
      const now = Date.now();
      if (now < h.startAt - 500 || now > h.startAt + ROUND_MS + ANSWER_GRACE_MS) return;
      h.answers.set(p.playerId, { optionIndex: idx, tMs: Math.min(ROUND_MS, Math.max(0, now - h.startAt)) });
      checkAllAnswered();
    };

    const handleTimePing = (p: any) => {
      if (isHost) adapter.broadcast('time_pong', { to: p.playerId, t0: p.t0, hostNow: Date.now() });
    };

    // ----- client side -----

    const handleTimePong = (p: any) => {
      if (isHost || p.to !== playerId) return;
      const t1 = Date.now();
      const rtt = t1 - p.t0;
      if (rtt < clockRef.current.bestRtt) {
        clockRef.current = { bestRtt: rtt, offset: p.hostNow + rtt / 2 - t1 };
      }
    };

    const handleRosterUpdate = (p: any) => {
      if (isHost) return;
      playersRef.current = p.players;
      setPlayers(p.players);
      if (p.players.some((x: Player) => x.id === playerId) && joinTimerRef.current) {
        clearInterval(joinTimerRef.current);
        joinTimerRef.current = null;
      }
    };

    const handleJoinRejected = (p: any) => {
      if (!isHost && p.playerId === playerId) exitGame(p.reason ?? 'Could not join that room.', false);
    };

    const handleGameStart = (p: any) => {
      if (isHost) return;
      setScores({});
      setStreaks({});
      setTotalRounds(p?.total ?? TOTAL_ROUNDS);
      setGameState('COUNTDOWN');
    };

    const handleRoundStart = (p: any) => {
      if (isHost) return;
      beginRound(p);
    };

    const handleRoundEnd = (p: any) => {
      if (!isHost) applyRoundEnd(p);
    };

    const handleShowLeaderboard = () => {
      if (!isHost) setGameState('LEADERBOARD');
    };

    const handleAnswerProgress = (p: any) => {
      if (!isHost) setAnswerProgress(p);
    };

    const handleFinal = (p: any) => {
      if (isHost) return;
      setScores(p.scores);
      setStreaks(p.streaks ?? {});
      setGameState('END');
    };

    const handleHostLeft = () => {
      if (!isHost) {
        clearSessionTimers();
        audioRef.current?.pause();
        setHostLeft(true);
      }
    };

    const handlers: Record<string, (p: any) => void> = {
      join: handleJoin, leave: handleLeave, answer: handleAnswer, time_ping: handleTimePing,
      time_pong: handleTimePong, roster_update: handleRosterUpdate, join_rejected: handleJoinRejected,
      game_start: handleGameStart, round_start: handleRoundStart, round_end: handleRoundEnd,
      show_leaderboard: handleShowLeaderboard, answer_progress: handleAnswerProgress,
      final: handleFinal, host_left: handleHostLeft
    };
    Object.entries(handlers).forEach(([event, fn]) => adapter.on(event, fn));

    // Best effort: tell the room when this tab closes
    const onPageHide = () => {
      if (isHost) adapter.broadcast('host_left', {});
      else adapter.broadcast('leave', { playerId });
    };
    window.addEventListener('pagehide', onPageHide);

    // Exposed so the host buttons/timers use the same closure as the network handlers
    evaluateRef.current = evaluateRound;

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      adapter.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, isHost, playerId]);

  // ---------------- HOST FLOW ----------------

  /** Applies a round_start locally (clients receive it over the wire; the host calls it directly) */
  const beginRound = (p: { roundNo: number; total: number; options: string[]; type: 'title' | 'artist'; startAt: number; audioUrl: string }) => {
    setCurrentRound({ roundNo: p.roundNo, options: p.options, type: p.type, startAt: p.startAt });
    setTotalRounds(p.total);
    setCurrentSong({ audioUrl: p.audioUrl });
    setSelectedAnswerIdx(null);
    setCorrectIndex(null);
    setAnswerProgress(null);
    setEarned({});
    setCorrectIds([]);
    setTimeFrac(1);
    setTimeLeft(ROUND_SECONDS);
    setCountdown(3);
    setGameState('COUNTDOWN');
  };

  const hostStartRound = (roundNo: number) => {
    const h = hostRef.current;
    const round = h.rounds[roundNo - 1];
    h.roundNo = roundNo;
    h.answers.clear();
    h.roundOpen = true;
    h.startAt = Date.now() + COUNTDOWN_MS;

    const payload = {
      roundNo,
      total: h.rounds.length,
      options: round.options,
      type: round.type,
      startAt: h.startAt,
      audioUrl: round.song.audioUrl
    };
    adapterRef.current?.broadcast('round_start', payload);
    beginRound(payload);
    setAnswerProgress({ count: 0, total: playersRef.current.filter(p => p.id !== HOST_ID).length });

    // Timer lives on the host clock; the grace window lets in-flight answers land
    if (h.evalTimeout) clearTimeout(h.evalTimeout);
    h.evalTimeout = window.setTimeout(() => evaluateRef.current(), COUNTDOWN_MS + ROUND_MS + ANSWER_GRACE_MS);
  };

  const hostStartGame = (playlist: Song[], pool: Song[]) => {
    const others = playersRef.current.filter(p => p.id !== HOST_ID);
    if (others.length < 1 || playlist.length === 0) return;

    const h = hostRef.current;
    h.rounds = buildRounds(playlist.slice(0, TOTAL_ROUNDS), pool);
    h.started = true;
    h.scores = {};
    h.streaks = {};
    others.forEach(p => { h.scores[p.id] = 0; h.streaks[p.id] = 0; });

    setScores({});
    setStreaks({});
    setTotalRounds(h.rounds.length);
    adapterRef.current?.broadcast('game_start', { total: h.rounds.length });
    hostStartRound(1);
  };

  const hostNextStep = () => {
    const h = hostRef.current;
    if (gameState === 'REVEAL') {
      adapterRef.current?.broadcast('show_leaderboard', {});
      setGameState('LEADERBOARD');
    } else if (gameState === 'LEADERBOARD') {
      if (h.roundNo < h.rounds.length) {
        hostStartRound(h.roundNo + 1);
      } else {
        adapterRef.current?.broadcast('final', { scores: h.scores, streaks: h.streaks });
        setGameState('END');
      }
    }
  };

  // ---------------- ROUND TIMELINE (all devices) ----------------

  // COUNTDOWN: preload the clip, then flip to PLAYING at startAt (converted to the local clock)
  useEffect(() => {
    if (gameState !== 'COUNTDOWN' || !currentRound) return;

    const el = audioRef.current;
    if (el && currentSong) {
      el.src = currentSong.audioUrl;
      el.preload = 'auto';
      el.load();
    }

    const localStart = currentRound.startAt - clockRef.current.offset;
    const id = window.setInterval(() => {
      const remaining = localStart - Date.now();
      if (remaining <= 0) {
        clearInterval(id);
        setGameState('PLAYING');
      } else {
        setCountdown(Math.min(3, Math.ceil(remaining / 1000)));
      }
    }, 100);
    return () => clearInterval(id);
  }, [gameState, currentRound, currentSong]);

  // PLAYING: start audio and drive the timer bar from the shared deadline
  useEffect(() => {
    if (gameState !== 'PLAYING' || !currentRound) return;

    audioRef.current?.play().catch(e => console.error('[Audio] Playback blocked:', e));

    const deadline = currentRound.startAt - clockRef.current.offset + ROUND_MS;
    const id = window.setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setTimeFrac(left / ROUND_MS);
      setTimeLeft(Math.ceil(left / 1000));
      if (left === 0) clearInterval(id);
    }, 100);

    return () => {
      clearInterval(id);
      audioRef.current?.pause();
    };
  }, [gameState, currentRound]);

  const handleClientAnswer = (idx: number) => {
    if (isHost || gameState !== 'PLAYING' || selectedAnswerIdx !== null) return;
    setSelectedAnswerIdx(idx);
    adapterRef.current?.broadcast('answer', { playerId, optionIndex: idx });
  };

  // ---------------- RENDER ----------------

  const goHome = () => exitGame(null, false);

  let content: React.ReactNode;

  if (hostLeft) {
    content = <HostLeftScreen onHome={goHome} />;
  } else if (!roomCode || gameState === 'LOBBY') {
    content = (
      <LobbyScreens
        key={sessionKey}
        isHost={isHost}
        roomCode={roomCode}
        players={players}
        onHostGame={handleHostGame}
        onJoinLobby={handleJoinLobby}
        onStartHostGame={hostStartGame}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
      />
    );
  } else if (gameState === 'COUNTDOWN') {
    content = <CountdownScreen count={countdown} />;
  } else if (gameState === 'PLAYING' && currentRound) {
    content = (
      <PlayingScreen
        round={currentRound}
        total={totalRounds}
        timeLeft={timeLeft}
        timeFrac={timeFrac}
        selected={selectedAnswerIdx}
        isHost={isHost}
        score={scores[playerId] || 0}
        streak={streaks[playerId] || 0}
        answered={answerProgress}
        onAnswer={handleClientAnswer}
      />
    );
  } else if (gameState === 'REVEAL' && currentRound && correctIndex !== null) {
    const nonHost = players.filter(p => p.id !== HOST_ID);
    content = (
      <RevealScreen
        key={currentRound.roundNo}
        roundNo={currentRound.roundNo}
        total={totalRounds}
        isHost={isHost}
        selected={selectedAnswerIdx}
        correctIndex={correctIndex}
        options={currentRound.options}
        song={revealSong}
        score={scores[playerId] || 0}
        earned={earned[playerId] || 0}
        streak={streaks[playerId] || 0}
        correctPlayers={players.filter(p => correctIds.includes(p.id))}
        respondents={nonHost.length}
        onContinue={hostNextStep}
      />
    );
  } else if (gameState === 'LEADERBOARD') {
    content = (
      <LeaderboardScreen
        rows={rankPlayers(players, scores, streaks)}
        playerId={playerId}
        isHost={isHost}
        isLastRound={(currentRound?.roundNo ?? 0) >= totalRounds}
        onNext={hostNextStep}
      />
    );
  } else if (gameState === 'END') {
    content = <EndScreen rows={rankPlayers(players, scores, streaks)} playerId={playerId} onHome={goHome} />;
  } else {
    content = <CountdownScreen count={0} />; // waiting for the first round_start
  }

  return (
    <>
      <TopBar inRoom={!!roomCode && !hostLeft} isHost={isHost} onExit={() => exitGame()} />
      {content}
    </>
  );
}

export default GameLoop;
