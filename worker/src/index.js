// Explosion Rockets — CMS API (placeholder Worker).
//
// This starter exists so the GitHub repo can be connected to Cloudflare
// (Workers Builds), which registers the workers.dev subdomain and proves the
// deploy pipeline. The real auth-proxy logic (login + committing to GitHub on
// behalf of an authenticated band member) is added once the login method is
// chosen. No secrets live in this file — those are set as Worker variables in
// the Cloudflare dashboard.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const body = {
      ok: true,
      service: "er-cms",
      path: url.pathname,
      msg: "Worker live — klaar om uitgebreid te worden.",
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  },
};
