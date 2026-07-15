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

## Endpoints

- `GET  /` — health check
- `GET  /auth/login?redirect=<cms-url>` — start Google sign-in
- `GET  /auth/callback` — Google redirect target (set as the Authorized redirect
  URI: `https://er-cms.explosionrockets.workers.dev/auth/callback`). Redirects
  back to the CMS with `#token=<session>` (or `#error=...`).
- `GET  /auth/me` — returns `{email}` for a valid `Authorization: Bearer` session
- `GET  /api/read?path=data/…` — read a repo file (session required)
- `POST /api/commit` — commit files in one commit `{message, files:[{path,base64}]}`
  (session required)
- `GET  /api/pipeline` — read-only booking pipeline, fetched live from Notion
  (session required). `?fresh=1` bypasses the cache. POST returns 405 (read-only).

## Booking pipeline (read-only mirror of Notion)

The booking pipeline is **managed in Notion** (the "ER Booking Pipeline" database).
The Worker fetches it **live via the Notion API** and serves a read-only copy to the
CMS — it is never written to the public repo/site. The `PIPELINE_KV` namespace is used
only as a short (5 min) cache. If `NOTION_TOKEN` is missing the endpoint returns
`503 notion not connected`.

Set up once:

1. Create a Notion **internal integration** (notion.so/my-integrations → New
   integration → copy the *Internal Integration Secret*, `ntn_…`).
2. **Share the "ER Booking Pipeline" database with that integration** (open the DB →
   ••• → Connections → add the integration). Without this, Notion returns nothing.
3. Add the token as an encrypted Worker secret **`NOTION_TOKEN`**.

The database id is hard-coded in `src/index.js` (`NOTION_DB`). The `PIPELINE_KV`
binding stays in `wrangler.toml` (used as the cache).

Session tokens are HMAC-signed with `SESSION_SECRET`, valid 30 days, and only
work against this Worker (they are not GitHub credentials).
