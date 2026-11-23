import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const allowedOrigins = new Set([
  "https://uni-verse-sheddykid.vercel.app",
  "https://sheddykid.github.io"
]);
const recentNotifications = new Map<string, number>();
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://uni-verse-sheddykid.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});

const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const publishableKey = keys.default || Deno.env.get("SUPABASE_ANON_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const authClient = createClient(supabaseUrl, publishableKey!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });

  try {
    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!accessToken) return Response.json({ error: "Authentication required." }, { status: 401, headers });

    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return Response.json({ error: "Authentication required." }, { status: 401, headers });

    const body = await req.json();
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return Response.json({ error: "A valid verification request is required." }, { status: 400, headers });
    }

    const lastSent = recentNotifications.get(user.id) || 0;
    if (Date.now() - lastSent < 60_000) {
      return Response.json({ success: true, duplicateSuppressed: true }, { status: 200, headers });
    }

    const userClient = createClient(supabaseUrl, publishableKey!, {
      global: { headers: { Authorization: "Bearer " + accessToken } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: request, error: requestError } = await userClient
      .from("verification_requests")
      .select("id,status,created_at")
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (requestError || !request) {
      return Response.json({ error: "Verification request not found." }, { status: 404, headers });
    }
    if (request.status !== "pending") {
      return Response.json({ error: "Only pending verification requests can trigger an alert." }, { status: 409, headers });
    }

    const { data: profile } = await userClient.from("profiles")
      .select("full_name,matric_number")
      .eq("id", user.id)
      .maybeSingle();

    const smtpUser = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpUser || !smtpPassword) {
      console.error("Verification notification SMTP secrets are not configured.");
      return Response.json({ error: "Email notification service is not configured." }, { status: 503, headers });
    }

    const recipient = "babularbossman@gmail.com";
    const reviewUrl = "https://uni-verse-sheddykid.vercel.app/admin-verifications.html";
    const submittedAt = new Date(request.created_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPassword }
    });

    await transport.sendMail({
      from: smtpUser,
      to: recipient,
      replyTo: user.email || undefined,
      subject: "Action required: New UNI-VERSE student ID verification",
      text: [
        "A student has submitted a university ID card for verification.",
        "",
        "Student: " + (profile?.full_name || "Name unavailable"),
        "Matriculation number: " + (profile?.matric_number || "Unavailable"),
        "Student email: " + (user.email || "Unavailable"),
        "Submitted: " + submittedAt,
        "Request ID: " + request.id,
        "",
        "Open the admin verification page to review the ID and approve or reject the request:",
        reviewUrl
      ].join("\n")
    });

    recentNotifications.set(user.id, Date.now());
    return Response.json({ success: true }, { status: 200, headers });
  } catch (error) {
    console.error("Verification notification failed:", error?.message || error);
    return Response.json({ error: "Could not send the administrator notification." }, { status: 500, headers });
  }
});
