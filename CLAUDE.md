# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BookNarrator — a Node.js CLI that turns a book title + author into a fully produced, narrated, illustrated YouTube video and (optionally) auto-publishes it. One run does: script writing (Claude) → voice narration (ElevenLabs) → illustrated scene generation (Canvas) → optional AI scene animation (Higgsfield) → synced captions → thumbnail → SEO metadata (Claude) → video composition (FFmpeg) → YouTube upload (Data API v3).

There is no test suite, linter, or build step in this repo — it's a single CLI script tree run directly with `node`.

## Commands

```bash
npm install                                                       # install deps (requires FFmpeg on PATH separately)

node index.js --livro "Dom Casmurro" --autor "Machado de Assis"  # full pipeline run (uploads as Private by default)
node index.js --livro "..." --autor "..." --publicar             # publish directly as Public instead of Private
node index.js --help                                              # list all flags
node index.js --listar-vozes                                      # list available ElevenLabs voices

node setup-youtube.js   # one-time OAuth authorization for YouTube upload (run once per channel)
node setup-canal.js     # set/update the authenticated channel's "About" description
```

Useful flags for iterating on one stage without re-running the whole (expensive, API-billed) pipeline:
`--skip-roteiro`, `--skip-naracao`, `--skip-cenas`, `--skip-animacao`, `--skip-video`, `--skip-upload`, `--musica <nome-sem-mp3>`, `--publicar`, `--output <dir>`. Each `--skip-*` reuses that stage's existing output files from disk instead of regenerating them — so to re-test only video composition after tweaking `src/video.js`, run with `--skip-roteiro --skip-naracao --skip-cenas`.

## Pipeline architecture

Each stage is a module under `src/`, called in sequence from `index.js`, and each stage **persists its output to `output/<slug>/`** before the next stage reads it back from disk (rather than just passing objects in memory). This means the pipeline is resumable via the `--skip-*` flags, and any stage can be re-run in isolation as long as its upstream files already exist.

```
src/roteiro.js   → roteiro.json, roteiro.md      (Claude: titulo, autor, gancho, segmentos[], conclusao, licao_principal)
src/narracao.js  → naracao.mp3                   (ElevenLabs TTS, SSML <break> tags between segments)
src/cenas.js     → cenas/cena_NN_*.png            (Canvas illustrations, one per segment + abertura + conclusão)
src/animacao.js  → cenas_animadas/cena_NN.mp4     (optional: Higgsfield image-to-video, per-scene fallback to PNG)
src/legenda.js   → legendas.ass                   (ASS subtitles, word-grouped)
src/thumbnail.js → thumbnail.png
src/metadata.js  → metadata.json                  (Claude: SEO title/description/tags + chapter timestamps)
src/video.js     → video_final.mp4                (FFmpeg composition of the above)
src/youtube.js   → uploads video_final.mp4 + thumbnail.png, sets description/chapters/tags
```

### Critical shared invariant: timing sync

`src/narracao.js` builds the TTS input as `gancho <break 1.5s> seg0 <break 1.0s> seg1 ... <break 1.5s> conclusao`. Both `src/legenda.js` (`calcularTimings`) and `src/video.js` (`duracoesDasCenas`, which calls `calcularTimings` from `legenda.js`) independently derive per-block timing from the **real measured MP3 duration**, distributed proportionally by **character count** of each block's text (not the `duracao_segundos` Claude estimated in the roteiro — that field is unused for timing, only used as a hint to Claude when writing segments). If the break structure in `narracao.js` ever changes, `calcularTimings` in `legenda.js` must change with it, since `video.js` depends on it for scene durations and `legenda.js` depends on it for subtitle sync — both need to agree on the same timeline.

### Scene generation (`src/cenas.js`)

Each segment is routed to one of 8 illustrated "scene painters" (`paintCity`, `paintForest`, `paintClimb`, `paintMind`, `paintLoop`, `paintOffice`, `paintNetwork`, `paintLight`) by keyword matching against the segment's title/key-point/narrated text (falls back to a round-robin if no keyword hits). Each segment also gets one of 8 hardcoded color palettes (`PALETAS`) indexed by segment position, not by scene type — so the same scene type can render in different palettes across segments. Note: `assets/template/cores.json` / `utils.js#carregarCores` is unused leftover from an earlier visual style — current palettes live inline in `cenas.js`.

Segment field is `titulo_slide`, **not** `titulo` — `roteiro.segmentos[i].titulo` does not exist.

### Output directory slug includes author

`output/<slug>/` where `slug = slugify("${livro} ${autor}")` — e.g. `output/dom-casmurro-machado-de-assis/`. This means the same book title by different authors gets separate folders.

### Music auto-discovery

`resolverMusica(livro, autor)` in `src/utils.js` resolves in priority order: `assets/musica/<livro-autor-slug>.mp3` → `assets/musica/<livro-slug>.mp3` → `assets/musica/background.mp3` → `null` (silent, no crash). Pass `--musica <name>` to override explicitly.

### Upload is Private by default

`uploadParaYoutube` always uploads as `privacyStatus: 'private'` and opens YouTube Studio in the browser afterward for review. Pass `--publicar` flag (or `publicar: true`) to publish directly as Public.

### Subtitle positioning

Subtitles (Alignment=2, bottom-center) are placed at MarginV=300 — above the 280px text band that occupies y=800–1080 in the scene PNGs. BorderStyle=3 (opaque box) with BackColour=`&H99000000` (semi-transparent black, ~40% opacity) for readability over illustrated backgrounds.

### Optional stages degrade silently

- **Higgsfield animation** (`src/animacao.js`) only runs if `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` are set in `.env`. If a single scene's animation call fails, that scene falls back to its static PNG rather than failing the run — `src/video.js` handles a mixed array of `.png`/`.mp4` scene paths (looped Ken Burns zoompan for images, looped+scaled/cropped trim for video clips, detected by extension via `isVideo()`).
- **YouTube upload** (`src/youtube.js`) only runs if `assets/yt_tokens.json` exists (created by `node setup-youtube.js`). Thumbnail upload specifically can fail independently of video upload if the channel isn't phone-verified — that failure is caught and logged as a warning, not fatal.

`index.js` computes the displayed step count (`TOTAL`) dynamically based on which optional stages are active, using an incrementing step counter rather than hardcoded step numbers — keep that pattern if adding/removing stages.

### FFmpeg gotcha

In `src/video.js`'s zoompan filter expressions, `d` is **not** a valid in-expression variable — durations must be substituted as a literal frame count via `frames(d)` before building the filter string, not referenced as `d` inside the expression itself (e.g. `on/${frames(d)}`, not `on/d`).

## Credentials (`.env`, never `.env.example`)

`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` are required. `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` (+ `node setup-youtube.js`) and `HIGGSFIELD_API_KEY`/`HIGGSFIELD_API_SECRET` are optional and gate their respective pipeline stages as described above. `.env.example` must only ever contain empty placeholders — real secrets belong in `.env`, which is gitignored.
