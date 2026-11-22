import { requireProfile } from "./supabase.js";

const session = await requireProfile();
if (session) {
  document.querySelector("#user-label").textContent = session.profile.role === "admin"
    ? "Admin preview"
    : (session.profile.matric_number || session.user.email);
}