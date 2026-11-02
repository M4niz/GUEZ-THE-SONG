import { useState, useRef, useEffect } from 'react';
import { Plus, Search, Play, Square, X, Check, Copy, Shuffle, Loader, RotateCcw } from 'lucide-react';
import { AVATARS } from '../data/avatars';
import { Avatar } from './Avatar';
import { PixelBackdrop, PixelSprite } from './PixelArt';
import {
  CHOICE_OPTIONS, DEFAULT_SETTINGS, LANGUAGES, MAX_ARTISTS, ROUND_OPTIONS, SECONDS_OPTIONS,
  SURPRISE_ARTISTS, buildAutoPlaylist, searchArtists, searchItunes, shuffle
} from '../utils/songs';
import type { ArtistHit, GameSettings, RoundTypes, Song } from '../utils/songs';

interface LobbyScreensProps {
  onHostGame: (avatar: string, name: string) => void;
  onJoinLobby: (code: string, name: string, avatar: string) => void;
  isHost: boolean;
  roomCode: string | null;
  players: { id: string; name: string; avatar?: string }[];
  onStartHostGame: (playlist: Song[], pool: Song[], settings: GameSettings) => void;
  notice: string | null;
  onDismissNotice: () => void;
}

const SETTINGS_KEY = 'guess-the-song:settings';

/** Last-used settings, validated against the allowed options */
function loadSettings(): GameSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (raw
      && ROUND_OPTIONS.includes(raw.rounds)
      && SECONDS_OPTIONS.includes(raw.roundSeconds)
      && CHOICE_OPTIONS.includes(raw.choices)
      && ['mixed', 'title', 'artist'].includes(raw.roundTypes)) {
      return raw as GameSettings;
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_SETTINGS;
}

type SetupMode = 'pick' | 'auto';
type SetupTab = SetupMode | 'settings';

const ROUND_TYPE_OPTIONS: { id: RoundTypes; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'title', label: 'Song only' },
  { id: 'artist', label: 'Artist only' }
];

function SongRow({ song, children }: { song: Song; children: React.ReactNode }) {
  return (
    <div className="song-row">
      {song.artwork ? <img className="art" src={song.artwork} alt="" /> : <div className="art">♪</div>}
      <div className="meta">
        <div className="song-title">{song.title}</div>
        <div className="song-sub">{song.artist}</div>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function LobbyScreens({
  onHostGame,
  onJoinLobby,
  isHost,
  roomCode,
  players,
  onStartHostGame,
  notice,
  onDismissNotice
}: LobbyScreensProps) {

  const [view, setView] = useState<'HOME' | 'JOIN' | 'LOBBY'>(roomCode ? 'LOBBY' : 'HOME'); // roomCode is set when resuming or playing again
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('cat');
  const [isHostForm, setIsHostForm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Host setup
  const [tab, setTab] = useState<SetupTab>('pick');
  const [mode, setMode] = useState<SetupMode>('pick'); // which song source Start uses
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [artistQuery, setArtistQuery] = useState('');
  const [artistHits, setArtistHits] = useState<ArtistHit[]>([]);
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [artists, setArtists] = useState<ArtistHit[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [autoLang, setAutoLang] = useState('any');
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, [settings]);

  // Search artists as the host types (debounced; late responses are ignored)
  useEffect(() => {
    const q = artistQuery.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setArtistLoading(true);
      setArtistError(false);
      try {
        const hits = await searchArtists(q);
        if (!cancelled) setArtistHits(hits);
      } catch {
        if (!cancelled) { setArtistHits([]); setArtistError(true); }
      }
      if (!cancelled) setArtistLoading(false);
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [artistQuery]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const onArtistInput = (value: string) => {
    setArtistQuery(value);
    setDropdownOpen(true);
    if (value.trim().length < 2) { setArtistHits([]); setArtistLoading(false); setArtistError(false); }
  };

  const addArtist = (hit: ArtistHit) => {
    if (artists.length >= MAX_ARTISTS || artists.some(a => a.id === hit.id)) return;
    setArtists([...artists, hit]);
    setArtistQuery('');
    setArtistHits([]);
    setDropdownOpen(false);
  };

  const removeArtist = (id: string) => setArtists(artists.filter(a => a.id !== id));

  const updateSettings = (patch: Partial<GameSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (playlist.length > next.rounds) setPlaylist(playlist.slice(0, next.rounds)); // keep the playlist within the new round count
  };

  const stopPreview = () => {
    audioRef.current?.pause();
    setPlayingPreview(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      setSearchResults(await searchItunes(searchTerm.trim(), 15));
      setSearched(true);
    } catch (err) {
      console.error('Search failed', err);
      setSearchError('Search failed. Check your connection and try again.');
    }
    setIsSearching(false);
  };

  const togglePreview = (url: string) => {
    if (playingPreview === url && audioRef.current) {
      stopPreview();
    } else {
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.play().catch(e => console.error(e));
      audio.onended = () => setPlayingPreview(null);
      audioRef.current = audio;
      setPlayingPreview(url);
    }
  };

  const inPlaylist = (id: string) => playlist.some(s => s.id === id);

  const addToPlaylist = (song: Song) => {
    if (playlist.length >= settings.rounds || inPlaylist(song.id)) return;
    setPlaylist([...playlist, song]);
  };

  const removeFromPlaylist = (id: string) => setPlaylist(playlist.filter(s => s.id !== id));

  const handleStart = async () => {
    stopPreview();
    if (mode === 'pick') {
      onStartHostGame(playlist, playlist, settings);
      return;
    }
    setAutoLoading(true);
    setAutoError(null);
    try {
      const { playlist: picked, pool, note } = await buildAutoPlaylist(artists.map(a => a.name), autoLang, settings.rounds);
      if (note) console.info('[Auto playlist]', note);
      onStartHostGame(picked, pool, settings);
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
    setAutoLoading(false);
  };

  const handleSurprise = async () => {
    stopPreview();
    setAutoLoading(true);
    setAutoError(null);
    try {
      const picks = shuffle(SURPRISE_ARTISTS).slice(0, 3);
      const { playlist: picked, pool } = await buildAutoPlaylist(picks, 'any', settings.rounds);
      onStartHostGame(picked, pool, settings);
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setTab('auto');
      setMode('auto');
    }
    setAutoLoading(false);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleHostClick = () => {
    setIsHostForm(true);
    setView('JOIN'); // Use the join form to collect name/avatar for host too
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isHostForm) {
      if (joinName.trim()) {
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
      <>
      <PixelBackdrop />
      <div className="page page-center" style={{ position: 'relative', zIndex: 1 }}>
        <div className="logo-box">
          <PixelSprite name="cd" size={80} className="px-spin" />
        </div>
        <h1 className="text-h1" style={{ color: 'var(--green-text)' }}>Guess the Song</h1>

        {notice && (
          <div className="card" role="status" style={{ borderColor: 'var(--orange)', width: '100%', maxWidth: '320px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '14px 16px' }}>
            <div style={{ flex: 1, fontWeight: 800 }}>{notice}</div>
            <button className="icon-btn sm" aria-label="Dismiss" onClick={onDismissNotice}><X size={16} /></button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '320px' }}>
          <button className="btn" onClick={handleHostClick}>
            Create room
          </button>
          <button className="btn blue" onClick={() => { setIsHostForm(false); setView('JOIN'); }}>
            Join room
          </button>
        </div>
      </div>
      </>
    );
  }

  if (view === 'JOIN') {
    return (
      <>
      <PixelBackdrop />
      <div className="page page-center" style={{ position: 'relative', zIndex: 1 }}>
        <h1 className="text-h1" style={{ color: 'var(--blue-text)' }}>
          {isHostForm ? 'Create Room' : 'Join Room'}
        </h1>

        <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '320px' }}>
          {!isHostForm && (
            <input
              className="input center"
              type="text"
              placeholder="Room code"
              autoCapitalize="characters"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              style={{ letterSpacing: '6px' }}
            />
          )}
          <input
            className="input center"
            type="text"
            placeholder="Your name"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value.slice(0, 15))}
          />

          <div>
            <div className="field-label" style={{ textAlign: 'center' }}>Choose your avatar</div>
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
                      padding: '12px', borderRadius: '14px', cursor: 'pointer',
                      border: `2px solid ${isSelected ? avatar.color : 'var(--border-color)'}`,
                      backgroundColor: isSelected ? `color-mix(in srgb, ${avatar.color} 18%, transparent)` : 'var(--surface)',
                      transition: 'all 0.2s', outline: 'none'
                    }}
                  >
                    <Icon size={32} color={isSelected ? avatar.color : 'var(--text-muted)'} />
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className={`btn ${isHostForm ? '' : 'blue'}`}
            disabled={(!isHostForm && joinCode.length !== 4) || !joinName.trim()}
            style={{ marginTop: '8px' }}
          >
            {isHostForm ? 'Create' : 'Join'}
          </button>

          <button type="button" className="btn gray" style={{ border: 'none', background: 'none', color: 'var(--text-muted)' }} onClick={() => setView('HOME')}>
            Cancel
          </button>
        </form>
      </div>
      </>
    );
  }

  // ---------------- LOBBY ----------------
  const startDisabled =
    autoLoading ||
    (mode === 'pick' ? playlist.length !== settings.rounds : artists.length === 0 && autoLang === 'any');

  return (
    <div className="page" style={{ gap: '16px' }}>
      <div className="card" style={{ textAlign: 'center', padding: '16px 20px' }}>
        <div className="field-label">Room code</div>
        <button
          onClick={copyCode}
          aria-label="Copy room code"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '48px', fontWeight: 900, letterSpacing: '8px', paddingLeft: '24px', paddingRight: '16px',
            color: 'var(--green-text)', backgroundColor: 'var(--green-light)',
            border: '2px solid var(--green)', borderRadius: '20px'
          }}
        >
          {roomCode}
          {copied ? <Check size={22} /> : <Copy size={22} style={{ opacity: 0.6 }} />}
        </button>
      </div>

      <div className="card">
        <div className="card-title">
          <span>Players</span>
          <span>{players.length} joined</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: '16px 8px', justifyItems: 'center' }}>
          {players.map(p => (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%', animation: 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
              <Avatar id={p.avatar} size={56} />
              <div style={{ fontWeight: 800, fontSize: '13px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                {p.name}{p.id === 'HOST' ? ' ★' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <>
          <div className="card">
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={tab === 'pick'} className={tab === 'pick' ? 'active' : ''} onClick={() => { setTab('pick'); setMode('pick'); }}>Pick songs</button>
              <button role="tab" aria-selected={tab === 'auto'} className={tab === 'auto' ? 'active' : ''} onClick={() => { stopPreview(); setTab('auto'); setMode('auto'); }}>Artists</button>
              <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'active' : ''} onClick={() => { stopPreview(); setTab('settings'); }}>Settings</button>
            </div>

            {tab === 'pick' ? (
              <>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Search iTunes (e.g. A.R. Rahman)"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  <button type="submit" className="btn blue" disabled={isSearching || !searchTerm.trim()} aria-label="Search" style={{ height: '52px', padding: '0 18px', flex: 'none' }}>
                    {isSearching ? <Loader size={20} /> : <Search size={20} />}
                  </button>
                </form>
                {searchError && <div className="error-note" style={{ marginTop: 0, marginBottom: '12px' }}>{searchError}</div>}

                <div className="scroll-area song-list" style={{ marginBottom: '20px' }}>
                  {searchResults.length === 0 && (
                    <div className="empty-note">{searched ? 'No playable songs found. Try another search.' : 'Search for a song or artist to add songs'}</div>
                  )}
                  {searchResults.map(song => (
                    <SongRow key={song.id} song={song}>
                      <button className="icon-btn sm blue" aria-label="Preview" onClick={() => togglePreview(song.audioUrl)}>
                        {playingPreview === song.audioUrl ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                      </button>
                      <button className="icon-btn sm green" aria-label="Add to playlist" disabled={inPlaylist(song.id) || playlist.length >= settings.rounds} onClick={() => addToPlaylist(song)}>
                        {inPlaylist(song.id) ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={3} />}
                      </button>
                    </SongRow>
                  ))}
                </div>

                <div className="card-title" style={{ marginBottom: '10px' }}>
                  <span>Playlist</span>
                  <span style={{ color: playlist.length === settings.rounds ? 'var(--green-text)' : 'var(--orange)' }}>
                    {playlist.length} / {settings.rounds}
                  </span>
                </div>
                <div className="song-list">
                  {playlist.length === 0 && <div className="empty-note">Add {settings.rounds} songs to start</div>}
                  {playlist.map(song => (
                    <SongRow key={song.id} song={song}>
                      <button className="icon-btn sm red" aria-label="Remove" onClick={() => removeFromPlaylist(song.id)}>
                        <X size={16} strokeWidth={3} />
                      </button>
                    </SongRow>
                  ))}
                </div>
              </>
            ) : tab === 'auto' ? (
              <>
                <div className="field-label">Artists ({artists.length}/{MAX_ARTISTS})</div>
                {artists.length > 0 && (
                  <div className="chips" style={{ marginBottom: '12px' }}>
                    {artists.map(a => (
                      <button key={a.id} type="button" className="chip active" onClick={() => removeArtist(a.id)} aria-label={`Remove ${a.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {a.name} <X size={14} strokeWidth={3} />
                      </button>
                    ))}
                  </div>
                )}
                <div ref={dropdownRef} style={{ position: 'relative', marginBottom: '20px' }}>
                  <input
                    className="input"
                    type="text"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    autoComplete="off"
                    placeholder={artists.length ? 'Add another artist…' : 'Type an artist, e.g. Anirudh'}
                    value={artistQuery}
                    disabled={artists.length >= MAX_ARTISTS}
                    onChange={e => onArtistInput(e.target.value)}
                    onFocus={() => setDropdownOpen(true)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setDropdownOpen(false);
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const first = artistHits.find(h => !artists.some(a => a.id === h.id));
                        if (first) addArtist(first);
                      }
                    }}
                  />
                  {dropdownOpen && artistQuery.trim().length >= 2 && (
                    <div className="dropdown" role="listbox">
                      {artistLoading && <div className="dropdown-note"><Loader size={14} /> Searching…</div>}
                      {artistError && <div className="dropdown-note" style={{ color: 'var(--red-text)' }}>Search failed. Try again.</div>}
                      {!artistLoading && !artistError && artistHits.length === 0 && <div className="dropdown-note">No artists found</div>}
                      {artistHits.map(hit => {
                        const picked = artists.some(a => a.id === hit.id);
                        return (
                          <button key={hit.id} type="button" role="option" aria-selected={picked} className="dropdown-item" disabled={picked} onClick={() => addArtist(hit)}>
                            <span className="name">{hit.name}</span>
                            <span className="genre">{picked ? 'Added' : hit.genre}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="field-label">Language</div>
                <div className="chips">
                  {LANGUAGES.map(l => (
                    <button key={l.id} type="button" className={`chip ${autoLang === l.id ? 'active' : ''}`} onClick={() => setAutoLang(l.id)}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="hint-note">
                  <Shuffle size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
                  Add one or more artists, pick a language, or both. We pull their songs from iTunes, shuffle them, and pick {settings.rounds} for the game.
                  Language is matched by iTunes genre, so it can miss some songs.
                </div>
                {autoError && <div className="error-note">{autoError}</div>}
              </>
            ) : (
              <>
                <div className="field-label">Seconds per round</div>
                <div className="chips" style={{ marginBottom: '20px' }}>
                  {SECONDS_OPTIONS.map(n => (
                    <button key={n} type="button" className={`chip ${settings.roundSeconds === n ? 'active' : ''}`} onClick={() => updateSettings({ roundSeconds: n })}>{n}s</button>
                  ))}
                </div>

                <div className="field-label">Answer choices</div>
                <div className="chips" style={{ marginBottom: '20px' }}>
                  {CHOICE_OPTIONS.map(n => (
                    <button key={n} type="button" className={`chip ${settings.choices === n ? 'active' : ''}`} onClick={() => updateSettings({ choices: n })}>{n}</button>
                  ))}
                </div>

                <div className="field-label">Number of rounds</div>
                <div className="chips" style={{ marginBottom: '20px' }}>
                  {ROUND_OPTIONS.map(n => (
                    <button key={n} type="button" className={`chip ${settings.rounds === n ? 'active' : ''}`} onClick={() => updateSettings({ rounds: n })}>{n}</button>
                  ))}
                </div>

                <div className="field-label">Question type</div>
                <div className="chips">
                  {ROUND_TYPE_OPTIONS.map(t => (
                    <button key={t.id} type="button" className={`chip ${settings.roundTypes === t.id ? 'active' : ''}`} onClick={() => updateSettings({ roundTypes: t.id })}>{t.label}</button>
                  ))}
                </div>

                <div className="hint-note">
                  {settings.rounds} rounds · {settings.roundSeconds}s each · {settings.choices} choices.
                  {mode === 'pick' && settings.choices > settings.rounds && ` Pick mode draws wrong answers from your ${settings.rounds} songs, so some questions may show fewer than ${settings.choices} choices.`}
                  {settings.roundTypes === 'artist' && " Artist-only needs several different artists; rounds fall back to song questions when it can't find enough."}
                </div>
                <button type="button" className="btn gray" style={{ marginTop: '16px', width: '100%' }} onClick={() => updateSettings(DEFAULT_SETTINGS)}>
                  <RotateCcw size={16} /> Reset to defaults
                </button>
              </>
            )}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
            {players.length < 2 && (
              <div className="hint-note" style={{ textAlign: 'center', margin: 0 }}>Playing solo? Start any time, or wait for friends to join.</div>
            )}
            <button className="btn" onClick={handleStart} disabled={startDisabled} style={{ width: '100%' }}>
              {autoLoading ? 'Finding songs…' : mode === 'auto' ? 'Shuffle & start' : 'Start game'}
            </button>
            <button className="btn gray" onClick={handleSurprise} disabled={autoLoading} style={{ width: '100%' }}>
              <Shuffle size={18} /> Surprise me
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontWeight: 800, textAlign: 'center', marginTop: 'auto', padding: '16px' }}>
          Waiting for host to start…
          <br /><span style={{ fontSize: '14px', fontWeight: 700 }}>Make sure your audio is unmuted.</span>
        </div>
      )}
    </div>
  );
}
