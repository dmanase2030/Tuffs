/* Invite links: https://riseboosts.com/i/<code>
 * Gives link previews the server's name, then opens Lumio, which shows the
 * invite card and joins after sign-in. Unknown codes still open Lumio, where
 * the card says the invite is invalid. */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const code = String(params.code || "");
  const ok = /^[A-Za-z0-9]{6,16}$/.test(code);
  let srv = null;
  if (ok && env.DB) {
    try {
      srv = await env.DB.prepare("SELECT s.name, s.descr, (SELECT COUNT(*) FROM lc_members m WHERE m.server_id = s.id) AS members FROM lc_invites i JOIN lc_servers s ON s.id = i.server_id WHERE i.code = ?1").bind(code).first();
    } catch { /* tables not there yet */ }
  }
  const title = srv ? `Join ${srv.name} on Lumio Chat` : "Lumio Chat invite";
  const desc = srv ? `${srv.members} member${srv.members === 1 ? "" : "s"}. ${srv.descr || "You've been invited to a Lumio Chat server."}` : "This invite may be invalid or expired.";
  const target = "/?invite=" + encodeURIComponent(ok ? code : "invalid");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(new URL(request.url).origin + "/i/" + (ok ? code : ""))}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1c120c;color:#ffe8c8;font:16px system-ui,-apple-system,sans-serif}a{color:#f2a54a}</style></head>
<body><p>Opening Lumio… <a href="${esc(target)}">Continue</a></p><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
