# er-cms Worker

Cloudflare Worker that will act as the CMS auth-proxy for the members area:
it authenticates band members and commits changes to this repo on their
behalf, so no personal GitHub token is needed in the browser.

- Deployed via **Cloudflare Workers Builds** (connected to this GitHub repo,
  root directory `worker/`). Pushing to `main` redeploys automatically.
- Secrets (GitHub token, session secret, allowed e-mails, OAuth credentials)
  are set as **Worker variables/secrets in the Cloudflare dashboard** — never
  committed here.
- `src/index.js` is currently a placeholder; the real logic is added after the
  login method is finalised.
