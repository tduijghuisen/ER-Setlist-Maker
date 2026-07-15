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
- `GET  /api/pipeline` — read the private booking pipeline (session required)
- `POST /api/pipeline` — save the pipeline `{pipeline:[…]}` (session required)

## Private booking pipeline (Cloudflare KV)

The booking pipeline holds contacts/e-mails/statuses and must **not** live in the
public repo/site. It is stored in a **KV namespace** bound as `PIPELINE_KV` and
served only through the session-gated `/api/pipeline` endpoints. If the binding is
absent the endpoints return `503 pipeline storage not configured`.

Set up once:

```bash
cd worker
npx wrangler kv namespace create PIPELINE_KV   # prints an id
```
Then add to `wrangler.toml` and redeploy (Workers Builds redeploys on push):

```toml
[[kv_namespaces]]
binding = "PIPELINE_KV"
id = "<the id from the command above>"
```

Session tokens are HMAC-signed with `SESSION_SECRET`, valid 30 days, and only
work against this Worker (they are not GitHub credentials).
