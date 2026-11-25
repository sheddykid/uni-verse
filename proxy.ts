import { next, rewrite } from "@vercel/functions";

const ROUTES = {
  "/student": "/student.html",
  "/notes": "/notes.html",
  "/past-questions": "/past-questions.html",
  "/quizzes": "/quizzes.html",
  "/quiz-session": "/quiz-session.html",
  "/quiz-history": "/quiz-history.html",
  "/quiz-analytics": "/quiz-analytics.html",
  "/timetable": "/timetable.html",
  "/flashcards": "/flashcards.html",
  "/flashcard-session": "/flashcard-session.html",
  "/note-summarizer": "/note-summarizer.html",
  "/summary-history": "/summary-history.html",
  "/summary-session": "/summary-session.html",
  "/videos": "/videos.html",
  "/youtube-videos": "/youtube-videos.html",
  "/verification": "/verification.html",
  "/admin": "/admin.html",
  "/admin-add-course": "/admin-add-course.html",
  "/admin-resources": "/admin-resources.html",
  "/admin-videos": "/admin-videos.html",
  "/admin-manage": "/admin-manage.html",
  "/admin-verifications": "/admin-verifications.html"
};

const LEGACY = {
  "/x8Kp2LmQ": "/student.html", "/n4Vq7RtP": "/notes.html",
  "/p6Mz2KxW": "/past-questions.html", "/q9Ld4HcR": "/quizzes.html",
  "/j3Wn8BvT": "/quiz-session.html", "/h5Rp1YkM": "/quiz-history.html",
  "/c2Tx7NpL": "/quiz-analytics.html", "/t8Km3QwV": "/timetable.html",
  "/f4Yz9LdN": "/flashcards.html", "/b7Pv2XkJ": "/flashcard-session.html",
  "/m6Qr8TcW": "/note-summarizer.html", "/r3Nv5HpK": "/summary-history.html",
  "/d9Xk4VzM": "/summary-session.html", "/v2Lp7QnC": "/videos.html",
  "/y5Ct1RmH": "/youtube-videos.html", "/g8Wm3PkT": "/verification.html",
  "/a7Kq2VnP": "/admin.html", "/e4Mx9RtL": "/admin-add-course.html",
  "/u6Hp3WzQ": "/admin-resources.html", "/i9Nc5KbR": "/admin-videos.html",
  "/o2Vt8LmX": "/admin-manage.html", "/z5Qr1YpN": "/admin-verifications.html"
};

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  const part = raw.split(";").map(value => value.trim()).find(value => value.startsWith(name + "="));
  if (!part) return "";
  try { return decodeURIComponent(part.slice(name.length + 1)); } catch { return ""; }
}

function readRoutes(request) {
  try {
    const value = JSON.parse(readCookie(request, "uv_routes") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function randomSlug() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function cookie(name, value, httpOnly = false) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=86400; SameSite=Lax; Secure${httpOnly ? "; HttpOnly" : ""}`;
}

export const config = { runtime: "nodejs" };

export default function middleware(request) {
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";

  // Never rewrite APIs, assets, Vercel internals, or files that are not app pages.
  if (
    path.startsWith("/api/") || path.startsWith("/assets/") ||
    path.startsWith("/_vercel/") || path === "/favicon.ico" ||
    /\.[a-z0-9]{2,8}$/i.test(path) && !path.endsWith(".html")
  ) return next();

  const normalized = path.endsWith(".html") ? path.slice(0, -5) : path;
  const destination = ROUTES[normalized] || LEGACY[path];

  // Every visit to a known app page receives a fresh URL token.
  if (destination) {
    const routes = readRoutes(request);
    let slug = randomSlug();
    while (routes[slug]) slug = randomSlug();
    routes[slug] = destination;
    const entries = Object.entries(routes).slice(-32);
    const response = Response.redirect(new URL("/" + slug + url.search, url.origin), 302);
    response.headers.set("Set-Cookie", cookie("uv_routes", JSON.stringify(Object.fromEntries(entries)), true));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  // Resolve a random URL only when its mapping cookie exists in this browser.
  const slug = path.slice(1);
  const routes = readRoutes(request);
  const mappedDestination = routes[slug];
  if (mappedDestination && !path.slice(1).includes("/")) {
    const response = rewrite(new URL(mappedDestination + url.search, url.origin));
    response.headers.append("Set-Cookie", cookie("uv_current", mappedDestination));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  return next();
}
