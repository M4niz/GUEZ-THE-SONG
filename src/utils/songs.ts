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

export const TOTAL_ROUNDS = 5;
export const ROUND_SECONDS = 15;
export const ROUND_MS = ROUND_SECONDS * 1000;
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
 * 3 distinct distractors (e.g. every song is by the same artist) it falls back to the other type.
 */
export function buildRounds(songs: Song[], pool: Song[]): HostRound[] {
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
      if (distractors.length === 3) break;
    }
    return { type, correct: text(song), distractors };
  };

  return songs.map(song => {
    const first: RoundType = Math.random() < 0.5 ? 'title' : 'artist';
    let pick = attempt(song, first);
    if (pick.distractors.length < 3) {
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

/**
 * "Pick an artist and/or a language" mode: pull a pool from iTunes, clean it up, shuffle,
 * and take TOTAL_ROUNDS songs. The whole pool is kept for distractors.
 */
export async function buildAutoPlaylist(artist: string, languageId: string): Promise<AutoPlaylist> {
  const a = artist.trim();
  const lang = LANGUAGES.find(l => l.id === languageId) ?? LANGUAGES[0];
  if (!a && lang.id === 'any') throw new Error('Enter an artist or choose a language.');

  const terms = a
    ? lang.id === 'any' ? [a] : [a, `${a} ${lang.label}`]
    : [`${lang.label} songs`, `${lang.label} hits`, `best of ${lang.label}`];

  const batches = await Promise.allSettled(terms.map(t => searchItunes(t, 50)));
  const fetched = batches.flatMap(b => (b.status === 'fulfilled' ? b.value : []));
  if (fetched.length === 0) throw new Error('Could not reach iTunes. Check your connection and try again.');

  let note: string | undefined;
  let candidates = fetched.filter(s => !JUNK.test(s.title) && !JUNK.test(s.movie));

  if (a) {
    const needle = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byArtist = candidates.filter(s => s.artist.toLowerCase().replace(/[^a-z0-9]/g, '').includes(needle));
    if (byArtist.length < TOTAL_ROUNDS) throw new Error(`Not enough playable songs found for "${a}".`);
    candidates = byArtist;
  }

  if (lang.id !== 'any') {
    const byLang = candidates.filter(s => lang.genre.test(s.genre ?? ''));
    if (byLang.length >= TOTAL_ROUNDS) {
      candidates = byLang;
    } else if (a) {
      note = `Couldn't confirm ${lang.label} for every song, so all of ${a}'s songs are included.`;
    } else {
      throw new Error(`Not enough ${lang.label} songs found. Try an artist instead.`);
    }
  }

  const seen = new Set<string>();
  const pool = shuffle(candidates).filter(s => {
    const k = normTitle(s.title);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (pool.length < TOTAL_ROUNDS) throw new Error('Not enough different songs found. Try another search.');

  return { playlist: pool.slice(0, TOTAL_ROUNDS), pool, note };
}
