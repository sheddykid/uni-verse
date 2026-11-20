import { withSupabase } from "npm:@supabase/server@^1";
import nodemailer from "npm:nodemailer@^9";

const allowedOrigins = new Set([
  "https://uni-verse-sheddykid.vercel.app",
  "https://sheddykid.github.io"
]);
const recentSubmissions = new Map();
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://uni-verse-sheddykid.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin);
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers });

    try {
      const userId = ctx.userClaims?.sub;
      if (!userId) return Response.json({ error: "Authentication required" }, { status: 401, headers });

      const lastSent = recentSubmissions.get(userId) || 0;
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
      const recipient = Deno.env.get("ADMIN_CONTACT_EMAIL") || "babularbossman@gmail.com";
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
          "Student account ID: " + userId,
          "Reply-to email: " + email,
          "",
          "Message:",
          message
        ].join("\n")
      });
      recentSubmissions.set(userId, Date.now());
      return Response.json({ success: true }, { status: 200, headers });
    } catch (error) {
      console.error("Contact email failed:", error?.message || error);
      return Response.json({ error: "Failed to send message." }, { status: 500, headers });
    }
  })
};
