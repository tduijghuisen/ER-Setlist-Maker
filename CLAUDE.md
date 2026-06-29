# CLAUDE.md — The Explosion Rockets website

Context for working on this repo. Read this first.

## What this is
A spectacular **pop-art / comic-book** one-page website for the Dutch rock-'n-roll band
**The Explosion Rockets**, living in **`/website/`**.

- **`website/index.html`** — the whole site (self-contained: inline CSS + JS, no build step).
- **`website/assets/`** — images, stickers, icons, album art, background videos.
- **`/index.html`** (repo root) — an OLD, unrelated "Setlist Maker" app. **Ignore it.**

Live (GitHub Pages, served from `main`): https://tduijghuisen.github.io/ER-Setlist-Maker/website/

## Git / deploy workflow
- Develop on branch **`claude/explosion-rockets-redesign-apxss6`**.
- Pages publishes from **`main`**, so after committing on the feature branch:
  `git checkout main && git merge --ff-only <feature> && git push origin main`, then switch back.
- Push with `-u origin <branch>`. Don't open PRs unless asked.
- **Always run git from the repo root** (a `cd website` first makes `git add website/` fail).

## Design system (pop-art comic)
CSS variables in `:root`:
- `--paper #F3E9D2` (cream), `--paper-2 #FFFDF4`, `--ink #16130F`
- `--red #E5342A`, `--red-2 #B81E16`, `--yellow #FFC81E`, `--blue #1E83C9`, `--blue-2 #135E94`
- `--sh rgba(0,0,0,.4)` — the **semi-transparent shadow used everywhere** (all offset box-shadows are `Xpx Ypx 0 var(--sh)`).
- Fonts (Google): **Bangers** (comic display), **Anton** (poster), **Archivo Black** (italic labels), **Inter** (body).

Look: thick black borders, halftone, comic sticker decals, floating panels over a **fixed background video**.

## Page structure
- Fixed background **video** (`.bgfx`): desktop/mobile source picked by viewport, poster fallback,
  interlace scanlines + dark veil. Boomerang clips loop seamlessly (native `loop`).
- Transparent **nav** that fades to `--sh` background on scroll (`.nav.scrolled`).
- **Hero**: big logo + tagline ("Rockin' & Rollin' since 1959") + CTAs + "next show" chip.
- Section order is controlled by **flexbox `order`** on `.page` (DOM order differs!):
  **De Band → De Mannen → Muziek → Geschiedenis → Shows → Video → Boeken**.
- Content = floating `.panel` cards (`.ink`/`.blue`/`.red` variants).

## Bilingual (NL/EN)
- Inline text via `data-i18n="key"` + the `I18N` map in the script; `applyLang()` swaps `innerHTML`.
- Long blocks (history, De Band copy) use paired `.lang-nl` / `.lang-en` divs toggled by `applyLang()`.
- `lang` 0 = NL (default), 1 = EN. Comic ticker words are intentionally static.

## Data lives in the script (top of `<script>`)
`MEMBERS`, `TIMELINE`, `SHOWS`, `VIDEOS` (YouTube IDs), `ARTISTS` (marquee). Rendered by `render*()`.

Current line-up (order + roles matter): Ruud Kuijpers (lead zang), Joost Roest (leadgitaar),
Menno Kuijpers (gitaar & zang), Martien van Engelen (toetsen & zang), Teun Duijghuisen (bas & zang),
Frans van Esch (drums & zang). Member photos: `assets/members/<key>.jpg` (4:5).

## Asset pipeline (Pillow + ffmpeg via pip)
Process new uploads locally; never hotlink (external hosts are blocked, see gotchas).
- Pillow is installed. ffmpeg: `pip install imageio-ffmpeg` then `imageio_ffmpeg.get_ffmpeg_exe()`.
- **Photos/scenes** → JPEG, progressive, ~760px (members) / ~1500–1600px (hero/strips), quality 78–88.
- **Stickers/logo (transparent)** → key out the white/cream background with `PIL.ImageDraw.floodfill`
  from the 4 corners (sentinel colour → alpha 0). Logo is a **palette PNG** (`quantize(FASTOCTREE)`) ≈33KB.
- **Background videos** → compress hard and bake a **boomerang** (forward+reverse) so a normal loop
  ping-pongs: `scale=1280/720, fps=24, split→reverse→concat`, libx264 CRF 30/31, `-an`, faststart.
  (26MB → ~2.5MB.) Keep total page weight small.

## Gotchas (these cost us time)
- **Don't trust the chat image preview.** A content filter rejects many uploads, and this long chat
  hits "Request too large (max 32MB)". Identify uploads by **dimensions + the user's labels**
  (e.g. member photos came in flyer order; map by IMG number). A fresh chat fixes the size error.
- **Network egress is allowlisted.** explosionrockets.com, CloudFront, YouTube, fonts CDN etc. are
  **blocked** for fetch/curl. Can't scrape the live site or download generated media — the user uploads files.
- **Higgsfield**: `generate_*` works, but result *retrieval* (`show_generations`/`job_display`) is gated
  and doesn't get approved here. So generated media can't be pulled in — rely on user uploads.
- **Flexbox min-width trap**: `.page` is `display:flex`, so flex items (`.sec`) need `min-width:0`,
  otherwise wide embeds (Spotify iframe) blow the layout past `max-width`.
- The `Edit` tool often needs a fresh `Read` of the file at the start of each turn.

## Verify before pushing
Tag balance + JS syntax: extract the `<script>` and run `node --check`; check `<div>` open/close counts;
confirm referenced `assets/...` paths exist.

## Verified band facts (for accurate copy)
Since 1959 (Vught, as **The Jet Black Robbers**; Radio Luxembourg final) → **The Hurricane Rollers** (60s,
Bart Strik) → **The Explosion Rockets** (70s; **Savage Kalman & The Explosion Rockets**, TROS Top 50) →
disbanded early 80s → **reunited 1985** (40 years in 2025). **Andy Tielman Award 2014**; main act at the
**Elvis Festival Bad Nauheim** 2023/24; shared stage with Peter Koelewijn, Chris Montez, The Blue Diamonds,
James Burton; support act on a Jerry Lee Lewis European tour. 9 albums; **500+ shows** across Europe;
2025 album **"The Sun Sessions"** partly recorded at **Sun Studio, Memphis**. Featured album on the site:
**"Reelin' & Rockin'"** (Spotify album embed). Spotify artist `50oIPfD4YcZc5xCzvMYBVZ`.
Webshop: https://shop.ermusicevents.nl/explosion-rockets/

## Open TODOs / nice-to-haves
- Real album covers for the placeholders if a discography section is reinstated.
- Confirm/extend the tour agenda (currently 4/19/26 Jul 2026 found via search; the live
  `#upcoming-events` couldn't be fetched).
- Optional: drop in `hero-video.mp4` style motion / extra band photos when provided.
