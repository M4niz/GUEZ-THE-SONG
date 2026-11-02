# CLAUDE.md

Guess the Song: a room-based multiplayer "guess the song" web game with a Duolingo-style look (light and dark). The product plan is in `.context/Song Guess Game Build Plan (Duolingo-style).md`. Treat it as the spec; the code implements only part of it (see "Plan vs. reality").

## Commands

- `npm run dev`: Vite dev server
- `npm run build`: `tsc -b && vite build`
- `npm run lint`: oxlint (clean)
- There are no tests. To check pure logic such as `buildRounds`, run a throwaway `.mts` file with `node --experimental-strip-types` and delete it afterwards.

## Stack

Vite 8, React 19, TypeScript (`verbatimModuleSyntax`: use `import type`), `@supabase/supabase-js` (Realtime Broadcast only), `fetch-jsonp` (iTunes Search API), `lucide-react`. No router, no state library, no backend. Styling lives in `src/index.css` (design tokens, `.btn`, `.card`, `.input`, `.song-row`, `.answer-card`, `.sheet`, keyframes). Only one-off layout uses inline styles. `src/App.css` is empty.

**Theming:** colors are CSS variables. Dark mode is `:root[data-theme='dark']` overriding them, set by `utils/theme.ts` (persisted in localStorage, applied in `main.tsx` before first paint). Use `var(--surface)` for backgrounds and `--green-text/--blue-text/--red-text` for colored *text*; never hardcode `white` or the `-dark` edge colors for text (those are for 3D button edges).

## Environment

`.env` (untracked, git-ignored) needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`). If they are missing, `RealtimeAdapter` silently falls back to `BroadcastChannel`, which only works between tabs of the same browser. That is useful for local testing (open two tabs: one hosts, one joins) but a deploy without env vars looks fine and has no real multiplayer.

## Architecture

```
main.tsx -> App.tsx -> components/GameLoop.tsx   state machine, host logic, network handlers, timers
                         |- TopBar.tsx           theme toggle (top right) + exit button/confirm modal (top left, in-room only)
                         |- LobbyScreens.tsx     home / join / lobby; host setup tabs "Pick songs", "Artists" (as-you-type artist dropdown, multi-select) and "Settings"
                         `- GameScreens.tsx      Countdown, Playing, Reveal, Leaderboard, End (podium), HostLeft (presentational)
components/PixelArt.tsx   original 8-bit sprites (vinyl, cd, note) drawn from character grids + PixelBackdrop for the home screen
components/Toasts.tsx    leave toasts
components/Effects.tsx   Confetti, XpBadge (points gather + count-up), StreakBadge (flame)
components/Avatar.tsx    data/avatars.ts
utils/songs.ts           constants, iTunes search, buildAutoPlaylist, buildRounds, shuffle
utils/realtime.ts        RealtimeAdapter: Supabase channel `room:<CODE>` or BroadcastChannel
utils/audio.ts           unlockAudio (call in a click), ding/buzz/coin tones, vibrate
utils/ranking.ts         rankPlayers
utils/theme.ts           useTheme
data/songs.json          sample songs; NOT imported anywhere (dead data)
```

**Host-authoritative model.** The host's browser owns the game. Clients send `join`, `leave`, `answer`, `time_ping`. The host sends `roster_update`, `join_rejected`, `game_start`, `round_start`, `answer_progress`, `player_left`, `round_end`, `show_leaderboard`, `final`, `time_pong`, `host_left`. The host is player id `'HOST'` and plays like everyone else (scored, on the leaderboard, solo games work), but does not receive its own broadcasts, so every host transition is applied locally *and* broadcast (`applyRoundEnd`, `beginRound`).

**State machine:** `LOBBY -> COUNTDOWN -> PLAYING -> REVEAL -> LEADERBOARD -> (COUNTDOWN | END)`.
- Every device (host included) runs the same timeline from `round_start.startAt`, a host wall-clock time. Clients convert it to local time with an offset from a `time_ping`/`time_pong` exchange (lowest-RTT sample). COUNTDOWN preloads the clip and flips to PLAYING at `startAt`; the timer bar counts down to `startAt + round length`.
- The host evaluates a round when the timer + grace window expires (`hostRef.evalTimeout`) or as soon as every player has answered. Answer time is measured by the host on arrival, not reported by the client. Only the first valid answer per player counts.
- Network callbacks and timers read refs (`adapterRef`, `playersRef`, `hostRef`, `clockRef`), never React state, to avoid stale closures. Keep it that way.
- Answers are not leaked ahead of time: `round_start` carries options and the clip URL only; title/artist/artwork arrive in `round_end`.

**Game settings** (`GameSettings` in `utils/songs.ts`, edited in the lobby Settings tab): rounds, seconds per round, answer choices, question type. The host passes them to `hostStartGame`; the per-round length travels in `round_start.seconds` and the host keeps `hostRef.roundMs`, so never use a fixed round length.

**Round building.** `buildRounds(playlist, pool)` picks `title` or `artist` per round with `choices - 1` distractors from `pool` (normalized, so no duplicate or look-alike options; falls back to the other type if it can't find 3). "Pick songs" mode uses the 5 chosen songs as the pool. "Artists" mode calls `buildAutoPlaylist(artistNames, language, rounds)`: it searches iTunes once per selected artist (up to 50 each, `country=IN`; artist names come from `searchArtists`, entity=musicArtist), drops karaoke/remix/cover-style tracks, dedupes titles, filters by artist and by iTunes *genre* for language (there is no language field), shuffles, takes `rounds` songs, and keeps the whole pool for distractors.

**Scoring** (`evaluateRound`, constants in `utils/songs.ts`): 300 base + up to 700 speed bonus (linear in how early the host received the answer) + streak bonus (50 per consecutive correct including this one, max 250). `round_end.detail` carries the per-player breakdown shown on the reveal sheet.

**Live answer info.** `answer_progress` carries `{count,total,answered:[{id,at}],picks?}`. Avatars appear on the timer bar at the moment each player locks in. `picks` (who chose which option) is only included once `REVEAL_PICKS_AT` (75% elapsed, i.e. 25% left) has passed; the host re-broadcasts at that moment via `progressRef`.

**Toasts.** When the host handles a `leave` (explicit, `pagehide`, or Supabase Presence) it shows a bottom-left "[avatar] name left" toast and broadcasts `player_left` so clients show it too. Keep the toast + broadcast inside `handleLeave`: a bad patch once dropped them silently.

**Audio.** One shared `<audio>` element (`audioRef`) is created by `unlockAudio()` inside the Create/Join click and reused for every round (iOS autoplay). `unlockAudio` also resumes the singleton AudioContext used for the sound effects. Keep reusing that element.

**Presence & reconnect.** Every client calls `adapter.track({playerId})` on connect; the adapter turns Supabase presence `leave` events into `presence_leave`, which the host treats as a `leave` (and clients treat as `host_left` when the host's id leaves). That catches closed or crashed tabs. A joiner's `{code, pid, name, avatar}` is kept in `sessionStorage`; on load `GameLoop` rejoins with the same player id. The host recognises a known id (it has a score entry), re-adds it to the roster and sends `state_sync` (scores plus the current `round_start` payload if a round is open, and the player's answer). Between rounds the rejoiner just waits for the next `round_start`. `RealtimeAdapter.cleanup()` closes the channel after 400 ms so a final `leave` can flush. After a refresh the browser may block clip audio until the first tap. Presence does not exist on the `BroadcastChannel` fallback, which relies on `pagehide`.

**Play again / Surprise me / persisted prefs.** The host's End screen can broadcast `play_again`, which sends everyone back to the lobby with the same roster. The lobby's "Surprise me" button starts a game from 3 random `SURPRISE_ARTISTS`. Lobby settings persist in localStorage (`guess-the-song:settings`); mute persists in `guess-the-song:muted` (`utils/audio.ts`, toggled from `TopBar`). A tick sounds in the last 3 seconds of a round.

**Leaving.** `exitGame()` broadcasts `leave` (or `host_left`), tears down the adapter, resets all state and bumps `sessionKey` so `LobbyScreens` remounts at HOME. A joiner that gets no roster reply after 4 join attempts (~10 s) leaves with "Room not found".

## Conventions

- Round/playlist sizes and timings are constants in `utils/songs.ts`; use them instead of literals.
- Event payloads are `any`; the real shapes are the `broadcast(...)` call sites in `GameLoop.tsx`. The `GameEvent` union in `realtime.ts` is unused and out of date.
- Because the host never hears its own events, any new feature that must show on the host also needs a direct local state update beside the `broadcast`.
- Respect `prefers-reduced-motion`: global rule in `index.css` shortens animations and hides confetti/XP particles.

## Plan vs. reality (not implemented)

Host reconnect (a refreshed host ends the game), reconnecting into the reveal/leaderboard screens (the rejoiner waits for the next round), background music, movie round type, language/difficulty-aware distractors in manual mode, clip length setting (the round timer is the only length control; previews are 30 s), mascot, vibration toggle, 12-player cap UI feedback beyond a rejection notice, `local` audio source / `songs.json` pipeline. Check this list before assuming a plan feature exists.

## Security note

Anyone who knows a room code can broadcast any event, including host events (`round_end`, `final`, `host_left`) and `answer` for another player id. The plan accepts this for a friends-only game. Room codes are not checked for uniqueness at creation.
