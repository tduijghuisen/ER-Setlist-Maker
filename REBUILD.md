# REBUILD.md — The Explosion Rockets site & CMS, from scratch

A technical runbook for recreating the whole system if it were ever lost, or for
handing it to a new maintainer. Non-technical band members want
[`admin/handleiding.html`](admin/handleiding.html) instead; this file assumes you
can use git, a terminal, and the GitHub / Cloudflare / Google dashboards.

The design brief and day-to-day conventions live in [`CLAUDE.md`](CLAUDE.md); the
Worker specifics in [`worker/README.md`](worker/README.md). This file is the
"stand it all up again" guide.

---

## 1. Architecture in one picture

```
Band member (browser)
   │  "Sign in with Google"
   ▼
Cloudflare Worker  er-cms          ──reads/commits (1 GitHub token)──▶  GitHub repo
 (Google OAuth + email allow-list,                                      tduijghuisen/ER-Setlist-Maker
  signs a 30-day session token)                                                │  push to main
   ▲                                                                           ▼
   └── CMS (admin/) sends Authorization: Bearer <token>            GitHub Pages ⇒ explosionrockets.com
```

- **No server, no database.** The whole public site is static files served by
  **GitHub Pages** from the `main` branch root. Content is plain JSON + images in the repo.
- The **CMS** (`admin/`) never holds a GitHub token. It logs the user in with Google
  via the **Cloudflare Worker**, which is the only thing that can write to the repo.
- Every CMS publish is **one git commit** (Git Data API: blobs → tree → commit → ref),
  which avoids racing the Pages deploy.

## 2. Accounts you need

| Service | Account | Purpose |
|---|---|---|
| GitHub | user `tduijghuisen` (Google `t.duijghuisen@gmail.com`) | repo + Pages hosting |
| Cloudflare | `t.duijghuisen@gmail.com`, account id `c70d6662eabfcfc0b826e77864dae7b8` | Worker `er-cms` + secrets |
| Google Cloud | `t.duijghuisen@gmail.com` | OAuth client for "Sign in with Google" |
| MijnDomein (registrar) | `t.duijghuisen@baril.nl` | domain `explosionrockets.com` + DNS |

Passwords are **not** in this repo — keep them in a password manager.

## 3. Repository layout

```
index.html              # entire public site (inline CSS+JS, no build step)
admin/index.html        # the members CMS (inline CSS+JS)
admin/handleiding.html  # plain-language NL guide for band members
CNAME                   # "explosionrockets.com" — binds the custom domain
data/                   # content edited via the CMS (see §7)
  shows.json  videos.json  repertoire.json  setlists.json
  admin.json            # LEGACY (old password login) — unused, safe to delete
assets/                 # images: members/ shows/ repertoire/ albums/ stickers/ icons/ live/ video/
worker/                 # Cloudflare Worker (the auth + commit proxy)
  src/index.js  wrangler.toml  package.json  README.md
CLAUDE.md  REBUILD.md
```

There is **no build tooling**. `index.html` and `admin/index.html` are hand-authored
and self-contained. Verify JS before pushing by extracting the `<script>` and running
`node --check`.

## 4. GitHub Pages + custom domain

1. Push the repo to `github.com/tduijghuisen/ER-Setlist-Maker`.
2. **Settings → Pages**: Source = **GitHub Actions**. Deploys run via the repo's own
   workflow `.github/workflows/pages.yml` (uploads the root as the Pages artifact and
   calls `actions/deploy-pages`). It has `concurrency: {group: "pages", cancel-in-progress: true}`
   so several CMS publishes close together no longer collide into "Deployment failed,
   try again later" — a newer publish supersedes an in-flight one and only the latest
   content deploys. (The old *Deploy from a branch* source had no concurrency control
   and produced spurious deploy failures under rapid publishing.)
3. The `CNAME` file (contents: `explosionrockets.com`) makes Pages serve the custom domain.
4. **DNS at MijnDomein** (account `t.duijghuisen@baril.nl`):
   - `A` records for the apex `explosionrockets.com` → GitHub Pages IPs
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` → `tduijghuisen.github.io`
   - Enable **Enforce HTTPS** in GitHub Pages once the cert is issued.
5. A push to `main` triggers the **"pages build and deployment"** workflow (Actions tab).
   Live in ~1 min. Rapid successive publishes can collide → a failed deploy; if the
   *latest* run is green everything is fine, otherwise re-run the failed job.

## 5. Google OAuth (Sign in with Google)

In **Google Cloud Console** (account `t.duijghuisen@gmail.com`):

1. Create/choose a project → **APIs & Services → Credentials → Create OAuth client ID**
   → *Web application*.
2. **Authorized redirect URI** (exact):
   `https://er-cms.explosionrockets.workers.dev/auth/callback`
3. Configure the OAuth consent screen (scopes: `openid email profile`; add band members
   as test users, or publish the app).
4. Note the **Client ID** and **Client secret** → these become Worker secrets
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

> A single typo in the secret *name* (`GOOGLE_CLIENT_SERCRET`) once caused
> `invalid_client` for hours. The Worker has a health check at `/` returning `{ok:true}`.

## 6. Cloudflare Worker `er-cms`

Code: `worker/src/index.js` (an ES module). Config: `worker/wrangler.toml`
(`name = "er-cms"`, `main = "src/index.js"`).

**Deploy** — either connect **Workers Builds** to this repo (root directory `worker/`,
build/deploy command `npx wrangler deploy`, recommended watch paths `worker/*`) so a push
to `main` redeploys automatically, or deploy manually:

```bash
cd worker && npx wrangler deploy
```

**Secrets** (Worker → Settings → Variables and secrets, all *encrypted*):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud |
| `GITHUB_TOKEN` | fine-grained PAT, repo `ER-Setlist-Maker`, **Contents: Read and write** |
| `SESSION_SECRET` | random 32-byte hex (`openssl rand -hex 32`) |
| `ALLOWED_EMAILS` | comma-separated allowed Google e-mails |

The **workers.dev subdomain** must be registered once for the account (this was done via
the Cloudflare API: `PUT /accounts/<id>/workers/subdomain {"subdomain":"explosionrockets"}`),
giving the Worker its URL `https://er-cms.explosionrockets.workers.dev`.

**Endpoints:** `GET /` health · `GET /auth/login?redirect=` · `GET /auth/callback` ·
`GET /auth/me` · `GET /api/read?path=data/…` · `POST /api/commit {message, files:[{path,base64}]}`.
`REPO`, `ALLOWED_ORIGINS` and TTLs are constants at the top of `index.js`.

## 7. Data file formats

All under `data/`. The CMS reads/writes these; you can also hand-edit and commit.

**`shows.json`** — array of shows:
```json
{ "date":"2026-07-04", "description":"…", "location":"…",
  "flyer":"assets/shows/<slug>.jpg", "thumb":"assets/shows/<slug>-thumb.jpg",
  "ticket":"https://…" }
```

**`videos.json`** — array of `[youtubeId, label]` pairs:
```json
[ ["jcSHY2LRp2I", "Sweet Rockin' Angel live @ Rockin' Wouw"], … ]
```

**`repertoire.json`** — array of songs. Each song has uniform fields plus a `parts`
object keyed by role (`vocals`, `lead`, `rhythm`, `keys`, `bass`, `drums`). Each part
holds free-text `chords` and/or an `images` array (multiple sheets per role):
```json
{
  "id":"s000", "title":"…", "artist":"…", "key":"C", "bpm":"", "duration":"",
  "youtube":"https://youtu.be/…", "notes":"",
  "parts":{
    "drums":{ "images":[
      { "image":"assets/repertoire/<slug>-drums-<hash>.jpg",
        "imageThumb":"assets/repertoire/<slug>-drums-<hash>-thumb.jpg",
        "label":"snelle versie" } ] },
    "vocals":{ "chords":"🎤 Songtekst (lyrics): https://…", "images":[ … ] }
  }
}
```
- Lyrics are stored as **links** in `vocals.chords` (copyright — no full lyrics text).
- Legacy single `image`/`imageThumb` on a part is auto-migrated into `images[]` by
  `normalizeSong()` in the CMS.
- Images are ~1600px "full" + ~240px-tall "thumb" progressive JPEGs.

**`setlists.json`** — array of setlists; `songs` is an ordered list whose items are
either a song **id** (string), a header `{"h":"SET 1"}`, or an unresolved paste
`{"t":"raw title"}`:
```json
{ "id":"l…", "name":"Parelrock", "date":"2026-07-04", "notes":"",
  "songs":[ {"h":"SET 1"}, "s036", "s250", {"t":"LITTLE BIRD"} ] }
```

## 8. Local development & verification

```bash
python3 -m http.server 8000      # then open http://localhost:8000/ and /admin/
```
The CMS needs the live Worker to read/commit, so local editing of `admin/` UI is best
tested by injecting a fake `repertoire`/`setlists` and calling `renderSongs()` in the
console (or a headless Playwright check). Before pushing:
```bash
# extract <script> and syntax-check
node --check <(python3 - <<'PY'
import re;print('\n'.join(re.findall(r'<script>(.*?)</script>', open('admin/index.html').read(), re.S)))
PY
)
```
Confirm any referenced `assets/…` paths exist.

## 9. Deploy flow (day to day)

- **Content:** band members just use the CMS → "… publiceren" → one commit → the
  `pages.yml` workflow redeploys (concurrency-guarded, so concurrent publishes don't collide).
- **Code:** develop on a feature branch, then fast-forward `main`:
  ```bash
  git push -u origin <feature>
  git checkout main && git merge --ff-only <feature> && git push origin main
  git checkout <feature>
  ```
  A push touching `worker/` also redeploys the Worker (if Workers Builds is connected).

## 10. Common recovery tasks

- **Add/remove a band member:** edit `ALLOWED_EMAILS` in the Cloudflare Worker secrets.
- **GitHub token expired (401s in the CMS):** create a new fine-grained PAT (Contents:
  R/W) and overwrite the `GITHUB_TOKEN` Worker secret.
- **Login broken:** verify the Google redirect URI matches exactly, check secret *names*,
  and hit `https://er-cms.explosionrockets.workers.dev/` (should be `{ok:true}`).
- **Deploy failed mail:** should no longer happen (the `pages.yml` concurrency group
  serialises deploys). The commit (the saved data) is safe regardless. If one ever
  appears, re-run "Deploy site to GitHub Pages" from the Actions tab, or push any commit
  to `main`.
