import { json, guard, readBody, requireAdmin } from "../auth/_shared.js";
import { logAdminAI } from "./_log.js";
const REPO = "dmanase2030/Tuffs";

/* POST /api/ai/propose { title, summary, edits: [{ path, find, replace } | { path, content }], dryRun }
 * Admin-only. Turns a Lumio AI code proposal into a diff (dryRun) or a GitHub
 * pull request on a new lumio-ai/* branch. It never writes to main and never deploys.
 * Opening the PR needs the GITHUB_TOKEN secret on the Pages project; without it
 * the diff still works (the repo is public) and the app explains the setup. */

const PATH_RE = /^(public|functions)\/[A-Za-z0-9._\-\/\[\]]+$/;
const GH = "https://api.github.com/repos/" + REPO;
const MAX_FILE = 300000;

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function current(path, env) {
  const headers = { "user-agent": "lumio-ai" };
  if (env.GITHUB_TOKEN) headers.authorization = "Bearer " + env.GITHUB_TOKEN;
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path.split("/").map(encodeURIComponent).join("/")}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Couldn't read " + path + " from GitHub (" + r.status + ").");
  return await r.text();
}

/* Small line diff (LCS) for files up to a few hundred changed lines. */
function lineDiff(a, b, ctx = 2) {
  const A = a.split("\n"), B = b.split("\n");
  let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0; while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const a2 = A.slice(p, A.length - s), b2 = B.slice(p, B.length - s);
  const out = [];
  for (let i = Math.max(0, p - ctx); i < p; i++) out.push(" " + A[i]);
  if (a2.length * b2.length <= 250000) {
    const n = a2.length, m = b2.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) { out.push(" " + a2[i]); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] > L[i + 1][j])) out.push("+" + b2[j++]);
      else out.push("-" + a2[i++]);
    }
  } else {
    for (const l of a2) out.push("-" + l);
    for (const l of b2) out.push("+" + l);
  }
  for (let i = A.length - s; i < Math.min(A.length, A.length - s + ctx); i++) out.push(" " + A[i]);
  return `@@ line ${p + 1} @@\n` + out.join("\n");
}

async function plan(edits, env) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 8) throw new Error("A proposal needs 1–8 edits.");
  const files = new Map();
  for (const e of edits) {
    const path = String((e && e.path) || "").trim();
    if (!PATH_RE.test(path) || path.includes("..") || path.includes("//")) throw new Error("Proposals can only change files under public/ or functions/ (got " + (path || "no path") + ").");
    if (!files.has(path)) { const old = await current(path, env); files.set(path, { path, old, now: old }); }
    const f = files.get(path);
    if (typeof e.content === "string") {
      if (e.content.length > MAX_FILE) throw new Error(path + " is too big.");
      f.now = e.content;
    } else if (typeof e.find === "string" && e.find && typeof e.replace === "string") {
      if (f.now == null) throw new Error(path + " doesn't exist yet. Give the full content for a new file.");
      const n = f.now.split(e.find).length - 1;
      if (n !== 1) throw new Error(n ? `The text to change appears ${n} times in ${path}; it must be unique.` : `Couldn't find the text to change in ${path}. Paste the current code so I can match it exactly.`);
      f.now = f.now.replace(e.find, () => e.replace);
    } else throw new Error("Each edit needs either content, or find and replace.");
  }
  const out = [];
  for (const f of files.values()) {
    if (f.now === f.old) continue;
    const status = f.old == null ? "added" : "modified";
    const diff = f.old == null
      ? "@@ new file @@\n" + f.now.split("\n").slice(0, 400).map(l => "+" + l).join("\n") + (f.now.split("\n").length > 400 ? "\n… (truncated)" : "")
      : lineDiff(f.old, f.now);
    out.push({ path: f.path, status, diff: `--- a/${f.path}\n+++ b/${f.path}\n` + diff, content: f.now, existed: f.old != null });
  }
  if (!out.length) throw new Error("The proposal doesn't change anything.");
  return out;
}

async function gh(env, path, method = "GET", body) {
  const r = await fetch(GH + path, {
    method,
    headers: { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json", "user-agent": "lumio-ai", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("GitHub " + r.status + ": " + (d.message || "request failed"));
  return d;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const blocked = guard(request, env);
  if (blocked) return blocked;
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Admins only" }, 403);

  const body = await readBody(request);
  const title = String(body.title || "Change proposed by Lumio AI").trim().slice(0, 100);
  const summary = String(body.summary || "").trim().slice(0, 2000);
  let files;
  try { files = await plan(body.edits, env); }
  catch (e) { return json({ error: String(e.message || e) }, 400); }
  const view = files.map(({ path, status, diff }) => ({ path, status, diff }));
  const hasToken = !!env.GITHUB_TOKEN;
  if (body.dryRun) return json({ ok: true, title, summary, files: view, canOpen: hasToken });

  if (!hasToken) {
    await logAdminAI(env, admin.username, "code_proposal", { title, paths: files.map(f => f.path) }, false, "no GITHUB_TOKEN");
    return json({ error: "Code proposals need a GitHub token. The site owner has to add a GITHUB_TOKEN secret to the Pages project (fine-grained token for dmanase2030/Tuffs with Contents and Pull requests set to Read and write).", code: "no_github", files: view }, 503);
  }
  try {
    const main = await gh(env, "/git/ref/heads/main");
    const branch = "lumio-ai/" + (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "change") + "-" + Date.now().toString(36);
    await gh(env, "/git/refs", "POST", { ref: "refs/heads/" + branch, sha: main.object.sha });
    for (const f of files) {
      let sha;
      if (f.existed) sha = (await gh(env, "/contents/" + f.path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch))).sha;
      await gh(env, "/contents/" + f.path.split("/").map(encodeURIComponent).join("/"), "PUT", { message: title + " (" + f.path + ")", content: b64(f.content), branch, ...(sha ? { sha } : {}) });
    }
    const pr = await gh(env, "/pulls", "POST", {
      title, head: branch, base: "main",
      body: (summary ? summary + "\n\n" : "") + `Proposed through Lumio AI by admin **${admin.username}**. Nothing is live until this pull request is reviewed and merged.`,
    });
    await logAdminAI(env, admin.username, "code_proposal", { title, branch, paths: files.map(f => f.path) }, true, pr.html_url);
    return json({ ok: true, url: pr.html_url, number: pr.number, branch, files: view });
  } catch (e) {
    const msg = String(e.message || e);
    await logAdminAI(env, admin.username, "code_proposal", { title, paths: files.map(f => f.path) }, false, msg);
    return json({ error: msg }, 400);
  }
}
