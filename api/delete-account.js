const SUPABASE_URL = "https://xcybjuwearndoljqkzmy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8egrnqtwHtrfzvtPcldiQw_y1Wqhh9w";

function respond(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Method not allowed." });
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    return respond(res, 503, {
      error: "Account deletion is not configured yet. Please contact the UNI-VERSE administrator."
    });
  }

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!accessToken || !password || password.length > 1024) {
    return respond(res, 400, { error: "Your current password is required." });
  }

  try {
    const authHeaders = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`
    };
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders });
    if (!userResponse.ok) return respond(res, 401, { error: "Your session has expired. Sign in again." });
    const user = await userResponse.json();
    if (!user?.id || !user.email) return respond(res, 401, { error: "Your account could not be verified." });

    const passwordResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password })
    });
    if (!passwordResponse.ok) return respond(res, 401, { error: "The password you entered is incorrect." });
    const passwordSession = await passwordResponse.json();
    if (passwordSession.user?.id !== user.id) {
      return respond(res, 403, { error: "The password verification did not match your signed-in account." });
    }

    const adminHeaders = {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json"
    };
    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: adminHeaders }
    );
    if (!profileResponse.ok) return respond(res, 500, { error: "Your account profile could not be checked." });
    const profiles = await profileResponse.json();
    const profile = profiles[0];
    if (!profile) return respond(res, 404, { error: "Your account profile could not be found." });

    if (profile.role === "admin") {
      const adminsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?select=id&role=eq.admin`,
        { headers: { ...adminHeaders, Prefer: "count=exact", Range: "0-1" } }
      );
      if (!adminsResponse.ok) return respond(res, 500, { error: "Administrator access could not be checked." });
      const admins = await adminsResponse.json();
      const range = adminsResponse.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      if ((Number.isFinite(total) ? total : admins.length) <= 1) {
        return respond(res, 409, { error: "This is the last administrator account. Assign another administrator before deleting it." });
      }
    }

    const deleteResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
      { method: "DELETE", headers: adminHeaders }
    );
    if (!deleteResponse.ok) {
      const detail = await deleteResponse.json().catch(() => ({}));
      const message = String(detail.code || detail.msg || detail.message || detail.error_description || "");
      if (/storage|object|owner/i.test(message)) {
        return respond(res, 409, { error: "This account still owns files in UNI-VERSE storage. Contact an administrator to transfer or remove those files before deleting the account." });
      }
      return respond(res, 500, { error: "Supabase could not delete the account. No deletion was confirmed; please contact the administrator." });
    }

    return respond(res, 200, { deleted: true });
  } catch {
    return respond(res, 500, { error: "A server error prevented account deletion. No successful deletion was confirmed." });
  }
}
