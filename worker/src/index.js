// Explosion Rockets — CMS API Worker
//
// Auth proxy for the members CMS:
//  - Band members sign in with Google (OAuth). Only e-mail addresses on the
//    ALLOWED_EMAILS list may enter.
//  - On success the Worker mints a signed session token (HMAC) that the CMS
//    keeps in the browser and sends as `Authorization: Bearer <token>`.
//  - Reads and commits to the GitHub repo happen here, using one server-side
//    GITHUB_TOKEN that no band member ever sees.
//
// Secrets (set in Cloudflare → Worker → Settings → Variables and secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_TOKEN, SESSION_SECRET,
//   ALLOWED_EMAILS  (comma-separated list of allowed Google e-mails)

const REPO = { owner: "tduijghuisen", name: "ER-Setlist-Maker", branch: "main" };
const ALLOWED_ORIGINS = [
  "https://explosionrockets.com",
  "https://www.explosionrockets.com",
  "https://tduijghuisen.github.io",
];
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const STATE_TTL = 10 * 60 * 1000;             // 10 minutes

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- base64url + HMAC helpers ---------- */
function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(payloadObj, secret) {
  const payload = b64url(enc.encode(JSON.stringify(payloadObj)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return payload + "." + b64url(sig);
}
async function verifyToken(token, secret) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  const key = await hmacKey(secret);
  let ok;
  try {
    ok = await crypto.subtle.verify("HMAC", key, b64urlBytes(sig), enc.encode(payload));
  } catch (e) {
    return null;
  }
  if (!ok) return null;
  let obj;
  try {
    obj = JSON.parse(dec.decode(b64urlBytes(payload)));
  } catch (e) {
    return null;
  }
  if (obj.exp && Date.now() > obj.exp) return null;
  return obj;
}

/* ---------- responses / CORS ---------- */
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Vary": "Origin",
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}
function safeRedirect(target) {
  try {
    const u = new URL(target);
    if (ALLOWED_ORIGINS.includes(u.origin)) return u.toString();
  } catch (e) {}
  return ALLOWED_ORIGINS[0] + "/admin/";
}
function allowedEmails(env) {
  return (env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/* ---------- GitHub ---------- */
function ghHeaders(env) {
  return {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "er-cms-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}
async function ghApi(env, method, endpoint, body) {
  const r = await fetch("https://api.github.com/repos/" + REPO.owner + "/" + REPO.name + "/" + endpoint, {
    method,
    headers: ghHeaders(env),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(method + " " + endpoint + " -> " + r.status + " " + (await r.text()).slice(0, 200));
  return await r.json();
}
function ghDecode(b64) {
  const clean = (b64 || "").replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}
async function readFile(env, path) {
  const r = await fetch(
    "https://api.github.com/repos/" + REPO.owner + "/" + REPO.name + "/contents/" + path + "?ref=" + REPO.branch + "&t=" + Date.now(),
    { headers: ghHeaders(env) }
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("read " + path + " -> " + r.status);
  const j = await r.json();
  return j.content ? ghDecode(j.content) : null;
}
// Commit several files in ONE git commit (blobs -> tree -> commit -> ref).
async function commitFiles(env, files, message) {
  const ref = await ghApi(env, "GET", "git/ref/heads/" + REPO.branch);
  const baseSha = ref.object.sha;
  const baseCommit = await ghApi(env, "GET", "git/commits/" + baseSha);
  const tree = [];
  for (const f of files) {
    const blob = await ghApi(env, "POST", "git/blobs", { content: f.base64, encoding: "base64" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await ghApi(env, "POST", "git/trees", { base_tree: baseCommit.tree.sha, tree });
  const commit = await ghApi(env, "POST", "git/commits", { message, tree: newTree.sha, parents: [baseSha] });
  await ghApi(env, "PATCH", "git/refs/heads/" + REPO.branch, { sha: commit.sha });
  return commit;
}

/* ---------- session ---------- */
async function sessionFrom(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return await verifyToken(m[1], env.SESSION_SECRET);
}

/* ---------- handler ---------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health check
    if (path === "/" || path === "/health") {
      return json({ ok: true, service: "er-cms", msg: "Worker live." }, 200, origin);
    }

    /* ----- Google OAuth: start ----- */
    if (path === "/auth/login") {
      const redirect = safeRedirect(url.searchParams.get("redirect") || "");
      const state = await signToken({ redirect, exp: Date.now() + STATE_TTL }, env.SESSION_SECRET);
      const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      g.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
      g.searchParams.set("redirect_uri", url.origin + "/auth/callback");
      g.searchParams.set("response_type", "code");
      g.searchParams.set("scope", "openid email profile");
      g.searchParams.set("state", state);
      g.searchParams.set("prompt", "select_account");
      return Response.redirect(g.toString(), 302);
    }

    /* ----- Google OAuth: callback ----- */
    if (path === "/auth/callback") {
      const code = url.searchParams.get("code");
      const stateObj = await verifyToken(url.searchParams.get("state") || "", env.SESSION_SECRET);
      const redirect = stateObj ? safeRedirect(stateObj.redirect) : ALLOWED_ORIGINS[0] + "/admin/";
      if (!code || !stateObj) return Response.redirect(redirect + "#error=auth", 302);
      // Exchange code for tokens (server-to-server over TLS -> id_token is trusted).
      const tokRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: url.origin + "/auth/callback",
          grant_type: "authorization_code",
        }),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tok.id_token) {
        const detail = encodeURIComponent(((tok.error || "geen id_token") + (tok.error_description ? ": " + tok.error_description : "")).slice(0, 180));
        return Response.redirect(redirect + "#error=token&detail=" + detail, 302);
      }
      let claims;
      try {
        claims = JSON.parse(dec.decode(b64urlBytes(tok.id_token.split(".")[1])));
      } catch (e) {
        return Response.redirect(redirect + "#error=token", 302);
      }
      const email = (claims.email || "").toLowerCase();
      if (claims.aud !== env.GOOGLE_CLIENT_ID || !claims.email_verified || !email) {
        return Response.redirect(redirect + "#error=verify", 302);
      }
      if (!allowedEmails(env).includes(email)) {
        return Response.redirect(redirect + "#error=notallowed", 302);
      }
      const session = await signToken({ email, exp: Date.now() + SESSION_TTL }, env.SESSION_SECRET);
      return Response.redirect(redirect + "#token=" + encodeURIComponent(session), 302);
    }

    /* ----- who am I ----- */
    if (path === "/auth/me") {
      const s = await sessionFrom(request, env);
      if (!s) return json({ ok: false }, 401, origin);
      return json({ ok: true, email: s.email }, 200, origin);
    }

    /* ----- read a repo file ----- */
    if (path === "/api/read") {
      const s = await sessionFrom(request, env);
      if (!s) return json({ ok: false, error: "unauthorized" }, 401, origin);
      const p = url.searchParams.get("path") || "";
      if (!p.startsWith("data/") && !p.startsWith("assets/")) return json({ ok: false, error: "bad path" }, 400, origin);
      try {
        const content = await readFile(env, p);
        return json({ ok: true, path: p, content }, 200, origin);
      } catch (e) {
        return json({ ok: false, error: String(e.message || e) }, 502, origin);
      }
    }

    /* ----- commit files (single git commit) ----- */
    if (path === "/api/commit" && request.method === "POST") {
      const s = await sessionFrom(request, env);
      if (!s) return json({ ok: false, error: "unauthorized" }, 401, origin);
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ ok: false, error: "bad json" }, 400, origin);
      }
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return json({ ok: false, error: "no files" }, 400, origin);
      for (const f of files) {
        if (typeof f.path !== "string" || typeof f.base64 !== "string" ||
            !(f.path.startsWith("data/") || f.path.startsWith("assets/"))) {
          return json({ ok: false, error: "bad file: " + (f && f.path) }, 400, origin);
        }
      }
      const message = (body.message || "CMS update") + "\n\nby " + s.email;
      try {
        const commit = await commitFiles(env, files, message);
        return json({ ok: true, sha: commit.sha }, 200, origin);
      } catch (e) {
        return json({ ok: false, error: String(e.message || e) }, 502, origin);
      }
    }

    return json({ ok: false, error: "not found" }, 404, origin);
  },
};
