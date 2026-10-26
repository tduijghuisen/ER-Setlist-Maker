# er-cms Worker

Cloudflare Worker that is the CMS auth-proxy for the members area: it signs band
members in with Google, restricts access to an allow-list of e-mails, and reads
and commits to this repo on their behalf using one server-side GitHub token. No
band member ever handles a token.

Deployed via **Cloudflare Workers Builds** (connected to this repo, root
directory `worker/`). Pushing to `main` redeploys automatically.

## Secrets (Cloudflare → Worker `er-cms` → Settings → Variables and secrets)

Add each as an **encrypted secret**:

| Name | Value |
|------|-------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret from Google Cloud |
| `GITHUB_TOKEN` | Fine-grained token, repo `ER-Setlist-Maker`, Contents: Read and write |
| `SESSION_SECRET` | Random 32-byte hex (`openssl rand -hex 32`) |
| `ALLOWED_EMAILS` | Comma-separated allowed Google e-mails |
| `NOTION_TOKEN` | Notion internal integration secret (read-only booking pipeline) |
| `FOW_EMAILS` | *(optional)* Comma-separated Google e-mails of **Festival op Wielen** editors (see below) |
| `EXTRA_ORIGINS` | *(optional)* Extra site origins allowed to use the Worker, e.g. `https://festivalopwielen.nl` once the festival site moves |

## Endpoints

- `GET  /` — health check
- `GET  /auth/login?redirect=<cms-url>` — start Google sign-in
- `GET  /auth/callback` — Google redirect target (set as the Authorized redirect
  URI: `https://er-cms.explosionrockets.workers.dev/auth/callback`). Redirects
  back to the CMS with `#token=<session>` (or `#error=...`).
- `GET  /auth/me` — returns `{email, role}` (`band` or `fow`) for a valid `Authorization: Bearer` session
- `GET  /api/read?path=data/…` — read a repo file (session required)
- `POST /api/commit` — commit files in one commit `{message, files:[{path,base64}]}`
  (session required)
- `GET  /api/pipeline` — read-only booking pipeline, fetched live from Notion
  (session required). `?fresh=1` bypasses the cache. POST returns 405 (read-only).

## Booking pipeline (read-only mirror of Notion)

The booking pipeline is **managed in Notion** (the "ER Booking Pipeline" database).
The Worker fetches it **live via the Notion API** and serves a read-only copy to the
CMS — it is never written to the public repo/site. If `NOTION_TOKEN` is missing the
endpoint returns `503 notion not connected`.

Set up once:

1. Create a Notion **internal integration** (notion.so/my-integrations → New
   integration → copy the *Internal Integration Secret*, `ntn_…`).
2. **Share the "ER Booking Pipeline" database with that integration** (open the DB →
   ••• → Connections → add the integration). Without this, Notion returns nothing.
3. Add the token as an encrypted Worker secret **`NOTION_TOKEN`**.

The database id is hard-coded in `src/index.js` (`NOTION_DB`).

**Optional cache.** The code can keep a 5-minute cache in a KV namespace bound as
`PIPELINE_KV`, but no such binding is configured: the namespace that was bound
lived in a *different* Cloudflare account, which made every deploy fail with
"KV namespace not found" (2026-08-29 → 2026-10). Without the binding the pipeline
is simply fetched from Notion on each request. To restore the cache, create a KV
namespace **in the er-cms account** and add it to `wrangler.toml` (see the
commented block there).

## Deploys

Workers Builds runs `npx wrangler deploy` (root `worker/`) on **every push to
`main`**, including CMS publishes. If those builds fail, the CMS content still
lands on the site (GitHub Pages deploys it separately), but the Worker keeps
running its last successful version. Check Cloudflare → `er-cms` → Deployments
after changing anything in `worker/`. `keep_vars = true` in `wrangler.toml`
stops a deploy from removing variables set in the dashboard.

Session tokens are HMAC-signed with `SESSION_SECRET`, valid 30 days, and only
work against this Worker (they are not GitHub credentials).

## Roles

Access is decided **per request** from the two e-mail lists, so removing an
address revokes it immediately (existing sessions included).

| Role | Who | May read | May write |
|------|-----|----------|-----------|
| `band` | `ALLOWED_EMAILS` | `data/`, `assets/`, `concept/fow/content.json` | `data/`, `assets/`, festival content + photos |
| `fow` | `FOW_EMAILS` | `concept/fow/content.json` only | `concept/fow/content.json` and **new** photos `concept/fow/img/u/<name>.jpg\|png` |

`fow` editors cannot overwrite existing files, touch the page code, the band data
or the booking pipeline. A `content.json` that is not valid JSON (or lacks `hero`)
is refused, so a publish can never break the festival page.

The festival CMS lives at `/concept/fow/beheer/` and keeps its own session
(`fow_session`), separate from the band CMS.

