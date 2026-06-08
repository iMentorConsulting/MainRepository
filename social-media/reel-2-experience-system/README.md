# Reel 2 — «Εμπειρία και σύστημα»

Remotion project that builds the TikTok/Reels video described in
`ΟΔΗΓΙΕΣ EDITING - Εμπειρία και σύστημα.docx`. Vertical 1080x1920, 30fps.

## 1. Add your media

The raw footage is too large to keep in git, so it's gitignored. Download it
from the shared Drive folder and place it here using these **exact filenames**:

```
public/footage/
  1. BEST IMG_1956.MOV
  2. BEST IMG_1960.MOV
  3 BEST IMG_1963.MOV
  4. BEST IMG_1966.MOV
  5. BEST IMG_1972.MOV
  6. BEST IMG_1975.MOV
  7. BEST IMG_1975.MOV
  8. BEST IMG_1981.MOV
  9. BEST IMG_1982.MOV
  10. BEST IMG_1986.MOV
  ΕΜΠΕΙΡΙΑ-VIDEO1.mp4
  ΕΜΠΕΙΡΙΑ-VIDEO2.mp4
```

> All ten numbered camera clips (1-10) plus the two screen recordings.
> `src/footage.ts` already reflects this.

The brand logo (`logo-white-transparent.png`) is already included in `public/`.

## 2. Install & preview

```bash
npm install
npm start          # opens Remotion Studio at localhost
```

In the Studio you can scrub through every beat, nudge timings in
`src/timeline.ts`, and see the synced captions / split screen / logo outro
update live.

## 3. Render

```bash
npx remotion render Reel2-ExperienceAndSystem out/reel-2.mp4
```

## What's already built (mapped 1:1 to the brief)

| Beat | File | What it does |
|---|---|---|
| ΕΜΠΕΙΡΙΑ hook | `components/TitleCard.tsx` | Fade + scale 95%→100%, no bounce |
| ΕΜΠΕΙΡΙΑ-VIDEO1 / VIDEO2 inserts | `Reel2.tsx` + `components/BlurRegion.tsx` | Plays the screen recordings; covers the visible link with a brand-blue patch (also addresses the note about recoloring that corner) |
| "Χτίζεται με τα χρόνια" / "Δεν αρκεί." / "Σοβαρή προσέγγιση" | `components/TitleCard.tsx` (`PunchLine`) | Short held captions over b-roll |
| Smash cut | `Reel2.tsx` | Hard cut + brief hold (kept deliberately plain — "όχι fancy transition") |
| ΣΥΣΤΗΜΑ beat | `Reel2.tsx` + `audio/whoosh.mp3` | 0.3s silent pause then the word + a synthesized whoosh |
| Split screen | `components/SplitScreen.tsx` | You (top half) / animated "system" rule-checklist (bottom half) |
| Synced captions | `components/SyncedCaptions.tsx` | 3 sequential lines + quick-flashing "field" chips for "ένα προς ένα" |
| Logo outro | `components/LogoOutro.tsx` + `audio/outro-note.mp3` | Logo fade-in, tagline, optional CTA, music resolves on a clean note |

## About the audio

You said you don't have music or a whoosh sfx, so I generated three
lightweight placeholder assets with ffmpeg (in `public/audio/`):

- `whoosh.mp3` — short filtered-noise sweep for the ΣΥΣΤΗΜΑ beat
- `outro-note.mp3` — soft three-note chord that the track "resolves" on, for the logo card
- `background-pad.mp3` — ambient pad bed under the whole reel (low in the mix, sits under the VO)

These are serviceable for a first cut, but a proper royalty-free music bed
will lift the final result a lot more — consider swapping
`background-pad.mp3` for a track from your TikTok/Instagram commercial music
library, Epidemic Sound, Artlist, or Pixabay Music (search "corporate
inspiring" / "calm confident corporate"). Just drop the replacement in
`public/audio/` and update the path in `src/Reel2.tsx`.

## Adjusting the clip-to-beat mapping

You said the footage is in numeric order. They're currently assigned in
`src/footage.ts` (`SHOT_*` constants) roughly in the order they appear in
the reel. If a particular clip doesn't fit its beat once you see it in
context, just edit the constant — no other file needs to change.

## Tuning the pacing

All beat lengths live in `src/timeline.ts` (`DURATIONS`). The two
screen-recording inserts are *not* hardcoded — `Root.tsx` measures their
real length via `calculateMetadata`/`getVideoMetadata` and the whole timeline
shifts to fit, so the total length will land close to your 30-50s target
once the real clips are in place.
