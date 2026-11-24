import { requireProfile } from "./supabase.js";
const session = await requireProfile();
if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  const label = document.querySelector("#user-label");
  const welcome = document.querySelector("#admin-welcome");
  const name = session.profile.full_name || session.user.email || "Administrator";
  if (label) label.textContent = name;
  if (welcome) welcome.textContent = "Welcome, " + (session.profile.full_name?.split(/\\s+/)[0] || "Administrator");
}