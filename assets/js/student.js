import { requireProfile, signOut } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
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

  const adminBack = document.querySelector("#admin-back");
  if (isAdmin && adminBack) adminBack.hidden = false;
}