import fetchJsonp from 'fetch-jsonp';

export interface Song {
  id: string;
  title: string;
  artist: string;
  movie: string;
  audioUrl: string;
  artwork: string;
  genre?: string;
}

export type RoundType = 'title' | 'artist';

export interface HostRound {
  song: Song;
  type: RoundType;
  options: string[];
  correctIndex: number;
}

export type RoundTypes = 'mixed' | 'title' | 'artist';

export interface GameSettings {
  rounds: number;
  roundSeconds: number;
  /** Answer options per question, including the correct one */
  choices: number;
  roundTypes: RoundTypes;
}

export const TOTAL_ROUNDS = 5;
export const ROUND_SECONDS = 15;
export const DEFAULT_SETTINGS: GameSettings = { rounds: TOTAL_ROUNDS, roundSeconds: ROUND_SECONDS, choices: 4, roundTypes: 'mixed' };

export const ROUND_OPTIONS = [3, 5, 8, 10, 15];
export const SECONDS_OPTIONS = [10, 15, 20, 30]; // previews are 30 s long
export const CHOICE_OPTIONS = [2, 3, 4, 5, 6];
export const MAX_ARTISTS = 5;
export const COUNTDOWN_MS = 3000;
/** How long the host keeps accepting answers after the timer hits zero (network latency) */
export const ANSWER_GRACE_MS = 1200;
export const MAX_PLAYERS = 12;

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- Round building ----------------

const normTitle = (t: string) =>
  t.toLowerCase().replace(/[([].*?[)\]]/g, '').replace(/\s-\s.*$/, '').replace(/[^a-z0-9\u0080-￿]/g, '');

/** "A.R. Rahman, Javed Ali & Mohit Chauhan" -> "a.r. rahman" so look-alike artist strings count as one option */
const primaryArtist = (a: string) =>
  a.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)[0].trim().toLowerCase();

/**
 * Build one question per song. Distractors come from `pool` (a bigger set than the playlist when
 * available) and never duplicate the correct answer or each other. If a round type can't produce
 * enough distinct distractors (e.g. every song is by the same artist) it falls back to the other type.
 */
export function buildRounds(songs: Song[], pool: Song[], settings: Pick<GameSettings, 'choices' | 'roundTypes'> = DEFAULT_SETTINGS): HostRound[] {
  const wanted = Math.max(1, settings.choices - 1);
  const everyone = [...songs, ...pool.filter(p => !songs.some(s => s.id === p.id))];

  const attempt = (song: Song, type: RoundType) => {
    const key = (s: Song) => (type === 'title' ? normTitle(s.title) : primaryArtist(s.artist));
    const text = (s: Song) => (type === 'title' ? s.title : s.artist);
    const seen = new Set([key(song)]);
    const distractors: string[] = [];
    for (const s of shuffle(everyone)) {
      const k = key(s);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      distractors.push(text(s));
      if (distractors.length === wanted) break;
    }
    return { type, correct: text(song), distractors };
  };

  return songs.map(song => {
    const first: RoundType = settings.roundTypes === 'mixed' ? (Math.random() < 0.5 ? 'title' : 'artist') : settings.roundTypes;
    let pick = attempt(song, first);
    if (pick.distractors.length < wanted) {
      const alt = attempt(song, first === 'title' ? 'artist' : 'title');
      if (alt.distractors.length > pick.distractors.length) pick = alt;
    }
    const options = shuffle([pick.correct, ...pick.distractors]);
    return { song, type: pick.type, options, correctIndex: options.indexOf(pick.correct) };
  });
}

// ---------------- iTunes search ----------------

export async function searchItunes(term: string, limit = 10): Promise<Song[]> {
  const response = await fetchJsonp(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=IN&entity=song&limit=${limit}`
  );
  const data = await response.json();
  return (data.results as any[])
    .filter(r => r.previewUrl && r.trackId)
    .map(r => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      movie: r.collectionName || '',
      audioUrl: r.previewUrl,
      artwork: r.artworkUrl100?.replace('100x100bb', '300x300bb') || '',
      genre: r.primaryGenreName || ''
    }));
}

export interface ArtistHit {
  id: string;
  name: string;
  genre: string;
}

export async function searchArtists(term: string, limit = 8): Promise<ArtistHit[]> {
  const response = await fetchJsonp(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=IN&entity=musicArtist&limit=${limit}`
  );
  const data = await response.json();
  const seen = new Set<string>();
  return (data.results as any[])
    .filter(r => r.artistId && r.artistName)
    .map(r => ({ id: String(r.artistId), name: r.artistName as string, genre: (r.primaryGenreName as string) || '' }))
    .filter(a => !seen.has(a.name.toLowerCase()) && !!seen.add(a.name.toLowerCase()));
}

export interface Language {
  id: string;
  label: string;
  /** iTunes has no language field; the genre name is the closest signal */
  genre: RegExp;
}

export const LANGUAGES: Language[] = [
  { id: 'any', label: 'Any', genre: /./ },
  { id: 'tamil', label: 'Tamil', genre: /tamil|kollywood/i },
  { id: 'hindi', label: 'Hindi', genre: /hindi|bollywood/i },
  { id: 'telugu', label: 'Telugu', genre: /telugu|tollywood/i },
  { id: 'malayalam', label: 'Malayalam', genre: /malayalam|mollywood/i },
  { id: 'kannada', label: 'Kannada', genre: /kannada|sandalwood/i },
  { id: 'punjabi', label: 'Punjabi', genre: /punjabi/i },
  { id: 'english', label: 'English', genre: /^(pop|rock|alternative|hip-hop|r&b|dance|electronic|country|singer|indie|metal|soundtrack|blues|jazz)/i }
];

const JUNK = /karaoke|instrumental|remix|cover|tribute|lo-?fi|reprise|slowed|reverb|8d|mashup|version/i;

export interface AutoPlaylist {
  playlist: Song[];
  pool: Song[];
  note?: string;
}

const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * "Pick artists and/or a language" mode: pull a pool from iTunes, clean it up, shuffle,
 * and take `rounds` songs. The whole pool is kept for distractors.
 */
export async function buildAutoPlaylist(artists: string[], languageId: string, rounds: number): Promise<AutoPlaylist> {
  const lang = LANGUAGES.find(l => l.id === languageId) ?? LANGUAGES[0];
  if (artists.length === 0 && lang.id === 'any') throw new Error('Add an artist or choose a language.');

  const terms = artists.length
    ? artists
    : [`${lang.label} songs`, `${lang.label} hits`, `best of ${lang.label}`];

  const batches = await Promise.allSettled(terms.map(t => searchItunes(t, 50)));
  const fetched = batches.flatMap(b => (b.status === 'fulfilled' ? b.value : []));
  if (fetched.length === 0) throw new Error('Could not reach iTunes. Check your connection and try again.');

  let note: string | undefined;
  let candidates = fetched.filter(s => !JUNK.test(s.title) && !JUNK.test(s.movie));

  if (artists.length) {
    const needles = artists.map(squash);
    candidates = candidates.filter(s => needles.some(n => squash(s.artist).includes(n)));
  }

  if (lang.id !== 'any') {
    const byLang = candidates.filter(s => lang.genre.test(s.genre ?? ''));
    if (byLang.length >= rounds) {
      candidates = byLang;
    } else if (artists.length) {
      note = `Couldn't confirm ${lang.label} for every song, so all songs by the chosen artists are included.`;
    } else {
      throw new Error(`Not enough ${lang.label} songs found. Try adding an artist.`);
    }
  }

  const seen = new Set<string>();
  const pool = shuffle(candidates).filter(s => {
    const k = normTitle(s.title);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (pool.length < rounds) {
    throw new Error(`Only ${pool.length} playable songs found, but the game needs ${rounds}. Add another artist or lower the rounds in Settings.`);
  }

  return { playlist: pool.slice(0, rounds), pool, note };
}
