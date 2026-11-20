import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const allowedOrigins = new Set([
  "https://uni-verse-sheddykid.vercel.app",
  "https://sheddykid.github.io"
]);
const recentSubmissions = new Map<string, number>();
const origins = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://uni-verse-sheddykid.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});

const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const publishableKey = keys.default || Deno.env.get("SUPABASE_ANON_KEY");
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

Deno.serve(async (req: Request) => {
  const headers = origins(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });

  try {
    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!accessToken) return Response.json({ error: "Authentication required." }, { status: 401, headers });

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return Response.json({ error: "Authentication required." }, { status: 401, headers });

    const lastSent = recentSubmissions.get(user.id) || 0;
    if (Date.now() - lastSent < 60_000) {
      return Response.json({ error: "Please wait before sending another message." }, { status: 429, headers });
    }

    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400, headers });
    }
    if (message.length < 10 || message.length > 5000) {
      return Response.json({ error: "Your message must be between 10 and 5000 characters." }, { status: 400, headers });
    }

    const smtpUser = Deno.env.get("SMTP_USERNAME");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const recipient = "babularbossman@gmail.com";
    if (!smtpUser || !smtpPassword) {
      console.error("Contact email SMTP secrets are not configured.");
      return Response.json({ error: "Contact email service is not configured." }, { status: 503, headers });
    }

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPassword }
    });
    await transport.sendMail({
      from: smtpUser,
      to: recipient,
      replyTo: email,
      subject: "UNI-VERSE student support message",
      text: [
        "A student sent a message through UNI-VERSE.",
        "",
        "Student account ID: " + user.id,
        "Student account email: " + (user.email || "Not available"),
        "Reply-to email: " + email,
        "",
        "Message:",
        message
      ].join("\n")
    });
    recentSubmissions.set(user.id, Date.now());
    return Response.json({ success: true }, { status: 200, headers });
  } catch (error) {
    console.error("Contact email failed:", error?.message || error);
    return Response.json({ error: "Failed to send message." }, { status: 500, headers });
  }
});
