import { json, sessionUser } from "./_shared.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: "Accounts are not set up yet — try again in a minute." }, 503);
  const user = await sessionUser(request, env);
  if (!user) return json({ error: "Not signed in" }, 401);
  return json({ username: user.username, isAdmin: !!user.is_admin });
}
