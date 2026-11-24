import { requireProfile } from "./supabase.js";

const session = await requireProfile();

if (session) {
  const { profile } = session;
  const isAdmin = profile.role === "admin";
  document.querySelector("#welcome").textContent = isAdmin
    ? `Student View · ${profile.full_name || "Administrator"}`
    : `Welcome, ${profile.full_name || "student"}`;
  document.querySelector("#user-label").textContent = isAdmin
    ? "Admin preview"
    : (profile.matric_number || session.user.email);
}