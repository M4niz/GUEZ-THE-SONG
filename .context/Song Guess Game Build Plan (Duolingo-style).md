# Song Guess Game: Build Plan

A room-based “guess the song” web game with a Duolingo-inspired look and feel, built entirely on free tools. Two audio options are planned side by side: **Option A (iTunes previews)** and **Option B (your own clips)**. Both share one architecture, so the audio source can be swapped without touching the game.

## 1. Game concept

- A host creates a room and shares a 4-letter code. Friends join from their phones or laptops.
- Each round plays a short clip. Everyone sees four answer cards (song title, or artist, depending on the round type) and taps one.
- Faster correct answers earn more points. Streaks add bonus XP.
- After each round there is a reveal, then a mini leaderboard. After the last round there is a podium.
- Round types (mix them): **Guess the song**, **Guess the artist**, **Guess the movie** (for film songs).
- Typical game: 10 rounds, about 5 minutes, 2 to 12 players.

## 2. Audio source options

### Option A: iTunes Search API (30-second previews)

**How it works**

- Free, no key. Search with `country=IN` and `entity=song`. Each result includes `trackName`, `artistName`, `previewUrl` (a 30-second clip), `artworkUrl100`, and `primaryGenreName`.
- Apple limits the API to roughly 20 calls per minute, so never search live during a game.
- Cross-site calls from a browser need the `callback` (JSONP) parameter, or a tiny Cloudflare Worker proxy. For a build script you can call the API directly.

**Pipeline (run once, offline)**

1. Write a seed list of artists and songs (for example 150 search terms in Tamil, Hindi, English).
2. A Node script (`build-pool.js`) searches each term, keeps the top results that have a `previewUrl`, and removes duplicates, remixes and karaoke versions.
3. The script saves `songs.json` with: `id`, `title`, `artist`, `language`, `previewUrl`, `artwork`, `startSec`.
4. Before each game, the host spot-checks that preview URLs still load. If one fails, the app re-fetches it with `lookup?id=<trackId>` or skips the song.

**Pros:** zero audio work, real recognizable songs, cover art included, no storage cost.

**Cons / risks**

- Regional catalog coverage is unverified. Test Tamil and Hindi searches in week one before committing.
- Previews are fixed 30-second clips, and you can’t choose the section.
- Apple’s terms are meant for promoting store content. A hobby game is low risk, but a public or monetized game needs a review of the terms.
- Preview URLs may change over time, so the refresh step above matters.

### Option B: Your own clips

**How it works**

- You prepare short MP3 clips (8 to 15 seconds) of songs you choose, host them as static files, and list them in `songs.json`.

**Pipeline**

1. Collect songs you are allowed to use (see the copyright note below).
2. Cut each clip with ffmpeg, adding a short fade so it doesn’t click:

```
ffmpeg -ss 45 -t 12 -i song.mp3 -af afade=t=in:d=0.3,afade=t=out:st=11.5:d=0.5 -b:a 96k clip_001.mp3
```

3. At 96 kbps a 12-second clip is about 150 KB, so 200 clips is roughly 30 MB.
4. Host the files on GitHub Pages, Cloudflare Pages, or Cloudflare R2 (free tier). Verify current free limits when you set up.
5. Add each clip to `songs.json` with `id`, `title`, `artist`, `language`, `movie`, `clipUrl`, `artwork` (optional), and `difficulty`.

**Pros:** full control over the exact hook of each song, any language, any era, no rate limits, clips never break.

**Cons / risks**

- **Copyright:** the songs belong to labels. Hosting clips on a public site is infringement risk. Keep this option for a private game with friends (non-public link, no ads, no money), or use licensed or royalty-free music.
- You do the editing work, roughly 1 to 2 minutes per clip.

### Comparison

|  | Option A: iTunes | Option B: Own clips |
| --- | --- | --- |
| Setup effort | Low (script) | Medium (cutting clips) |
| Song recognition | High | High (your choice) |
| Regional coverage | Needs testing | Anything you have |
| Clip control | None (30 s fixed) | Full |
| Reliability | Depends on Apple URLs | Fully yours |
| Legal risk | Low for hobby use | Higher if public |
| Best for | Fast start, public demo | Private game, regional songs |

**Recommendation:** start with Option A to get the whole game working, and add Option B clips for any songs iTunes lacks. Both live in the same `songs.json`, with a `source` field set to `itunes` or `local`.

## 3. Free tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Plain HTML, CSS and JavaScript, or Vite with Preact or React | Keep it light for phones |
| Hosting | Cloudflare Pages or GitHub Pages | Free static hosting |
| Realtime rooms | Supabase Realtime (Broadcast and Presence) | No custom server needed. Free projects can pause after inactivity, so check current limits |
| Backup realtime | Firebase Realtime Database, or PeerJS (peer-to-peer) | Swap if Supabase doesn’t suit |
| Proxy (optional) | Cloudflare Worker | Only for iTunes calls from the browser |
| Confetti | canvas-confetti (CDN) | Tiny library |
| Sound effects | Web Audio API tones, or CC0 sounds | No licensing worries |
| Fonts | Nunito (Google Fonts) | Free rounded font close to the Duolingo feel |

## 4. Architecture and data model

**Shared song object**

```
{ id, source: itunes|local, title, artist, movie, language,
  audioUrl, startSec, durationSec, artwork, difficulty }
```

**Audio adapter:** one function `getAudioUrl(song)` returns the right URL for either source. The rest of the game never knows which source it is.

**Host-authoritative model**

- The host’s browser runs the game logic. Players only send answers.
- This is simple and free. The trade-off is that a determined player could peek at network traffic, which is fine for friends.

**Realtime events (on channel `room:<CODE>`)**

- `player_join` / `player_leave` (via Presence)
- `game_start` with settings
- `round_start`: `{ roundNo, songId, options[], startAt }`
- `answer`: `{ playerId, optionIndex, tMs }` (sent to host)
- `round_end`: `{ correctIndex, scores, streaks }`
- `final`: podium data

**Sync:** each client estimates its clock offset from the host with a quick ping exchange at join, then starts audio at `startAt` plus offset. Expect roughly 100 to 300 ms of difference, which is fine for a guessing game.

**Audio unlock:** browsers block autoplay, so the Join or Ready button tap unlocks audio for the session. Preload each clip during the previous reveal.

**Reconnects:** if a player drops, they rejoin with the room code and their stored player ID (saved in the tab’s storage) and keep their score.

## 5. Round flow and scoring

1. **Countdown:** 3, 2, 1 with a pop animation.
2. **Play:** clip plays, timer bar drains (15 seconds).
3. **Answer:** a player’s first tap locks in. A “waiting for others” state shows after.
4. **Reveal:** a bottom sheet slides up (see section 6) with the correct answer, artwork and who got it right.
5. **Leaderboard:** quick animated re-rank, then the next round.

**Scoring**

- Correct: 1000 points minus the time elapsed (scaled), with a minimum of 400.
- Streak bonus: +50 per consecutive correct answer, capped at +250.
- Wrong or no answer: 0, and the streak resets.
- Show points as “XP”, to match the Duolingo-style theme.

**Distractors:** pick 3 wrong options from songs with the same language and similar era or genre. This keeps the choices believable. Never repeat a song in the same game.

## 6. Duolingo-inspired design system

Use the style as inspiration only. Don’t copy Duolingo’s name, logo, owl or other brand assets. Create your own original mascot (a simple character such as a music note or headphones creature).

### Color palette

| Role | Color |
| --- | --- |
| Primary green (buttons, progress) | `#58CC02`, dark edge `#58A700` |
| Blue (selected, info) | `#1CB0F6`, dark edge `#1899D6` |
| Red (wrong) | `#FF4B4B`, dark edge `#EA2B2B` |
| Yellow (streak, XP) | `#FFC800` |
| Orange (flame) | `#FF9600` |
| Purple (accents) | `#CE82FF` |
| Text dark | `#3C3C3C` |
| Text muted | `#777777` |
| Borders | `#E5E5E5` |
| Background | `#FFFFFF` |

### Typography

- **Nunito** weights 700, 800 and 900. Use 900 for headings, buttons and big numbers, and 700 for body text.
- Buttons use uppercase text with letter-spacing of about 0.8px.
- Large friendly sizes: 28 to 32 px headings, 17 to 19 px answers.

### Core components

- **Chunky 3D buttons:** rounded 16 px corners, a flat color, and a darker `border-bottom: 4px`. On press, remove the bottom border and shift down 4 px, which gives the tactile “squish.”
- **Answer cards:** white with a 2 px gray border and a 4 px bottom border. States:
  - Hover or default: light gray border.
  - Selected: light blue background (`#DDF4FF`) with a blue border.
  - Correct: light green background (`#D7FFB8`) with a green border.
  - Wrong: light red background (`#FFDFE0`) with a red border.
- **Progress bar:** thick rounded bar at the top showing the round number, with a lighter highlight strip on the green fill for a glossy look.
- **Timer bar:** thin bar that drains and turns from green to yellow to red in the last 5 seconds.
- **Feedback sheet:** a bottom panel that slides up after each reveal. Green with “Nice!” or red with “Correct answer:”, and a big Continue button. This is the most recognizable Duolingo pattern.
- **Avatars:** colored circles with initials or simple emoji.

### Animations and effects

| Moment | Effect |
| --- | --- |
| Button press | 4 px squish |
| Card tap | Quick scale-up (1.03) then settle |
| Correct answer | Card bounces, green flash, confetti burst, rising “ding” tone, “+XP” floats up |
| Wrong answer | Card shakes left and right (about 400 ms), soft “buzz” tone, short vibration on phones |
| Countdown | Numbers pop in with a spring (scale 0.5 to 1.2 to 1) |
| Now playing | Pulsing speaker circle with animated equalizer bars (fake CSS bars, not real analysis) |
| Feedback sheet | Slides up from the bottom with a slight overshoot |
| Streak | Flame icon grows and wiggles at 3 or more |
| XP counter | Counts up quickly to the new total |
| Leaderboard | Rows slide to their new positions (FLIP technique) |
| Podium | Bars rise in sequence, with confetti for the winner |
| Mascot | Idle bobbing, happy hop on correct, sad droop on wrong |

Respect `prefers-reduced-motion`: turn off shakes, confetti and bounces, and keep simple fades. Include a mute toggle and a vibration toggle.

### Screens

1. **Home:** mascot, big “Create room” and “Join room” buttons.
2. **Join:** name field and four large letter boxes for the code.
3. **Lobby:** room code in large type, animated avatars popping in as players join, and a Start button for the host with a minimum player check.
4. **Round:** progress bar, mascot or equalizer area, timer bar, four answer cards, and a Check (lock in) button.
5. **Reveal:** feedback sheet over the round screen.
6. **Leaderboard:** animated ranks with XP and streak flames.
7. **Podium:** top three with confetti and a Play again button.

### Mobile first

- Design for a 360 px wide screen first, with tap targets of at least 56 px height.
- Keep the answers in the thumb zone at the bottom of the screen.
- Use `100dvh` so mobile browser bars don’t cut off the layout.

## 7. Build phases

**Phase 0: Feasibility spike (1 to 2 days)**

- Test iTunes searches with `country=IN` for 20 Tamil and Hindi artists and note how many have working previews.
- Prepare 20 clips for Option B and confirm playback on a phone.
- Decide the source mix based on the results.

**Phase 1: Single-player prototype (3 to 4 days)**

- Build the round screen, answer cards, timer, feedback sheet and scoring using a local `songs.json`.
- Add the core animations and sounds here, so the feel is right early.

**Phase 2: Rooms and realtime (4 to 5 days)**

- Create and join rooms, lobby with presence, host-driven rounds, answer collection, synced start, and leaderboard.
- Test with 3 or more devices on different networks.

**Phase 3: Content and polish (3 to 5 days)**

- Grow the song list to 150+ songs, tag language and difficulty, and add the mascot, podium and reduced-motion handling.
- Add settings: rounds, round types, language filter, clip length.

**Phase 4: Launch (1 to 2 days)**

- Deploy to Cloudflare Pages or GitHub Pages, test on low-end phones, and share the link.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| iTunes lacks regional songs | Fall back to Option B clips for those songs |
| Copyright issues with own clips | Keep the game private, or use royalty-free music |
| Autoplay blocked on mobile | Unlock audio on the Join tap and preload clips |
| Players hear the clip at different times | Use `startAt` with clock offset, and accept small differences |
| Free realtime tier limits or pausing | Keep messages small, and keep Firebase or PeerJS as a backup |
| Host disconnects | Show a “host left” screen, or promote another player (optional later feature) |
| Cheating via network inspection | Acceptable for a friends game. Move answer checking to a server function later if needed |

## 9. Decisions to make before building

1. Will the game stay private with friends, or be shared publicly? This decides how much Option B you can use.
2. Which languages and eras matter most (Tamil, Hindi, English)?
3. Which round types do you want first: song title, artist, or movie?
4. Realtime service: Supabase (recommended) or Firebase?
5. Maximum players per room (suggested: 12).

## 10. Next step

Build the Phase 0 spike: a single test page that searches iTunes for Indian artists and plays previews, plus a sample clip player. Once the coverage is known, move to the Phase 1 prototype.
