import { supabase, showMessage } from "./supabase.js";
const form = document.querySelector("#login-form");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  const message = document.querySelector("#message");
  button.disabled = true;
  showMessage(message, "Signing in…");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.querySelector("#email").value.trim(),
    password: document.querySelector("#password").value
  });
  if (error) { showMessage(message, error.message); button.disabled = false; return; }
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    showMessage(message, "Your account profile is not ready. Contact an administrator.");
    button.disabled = false; return;
  }
  const adminPage = location.pathname.endsWith("admin-login.html");
  if (adminPage && profile.role !== "admin") {
    await supabase.auth.signOut();
    showMessage(message, "This account does not have administrator access.");
    button.disabled = false; return;
  }
  location.replace(profile.role === "admin" ? "./admin.html" : "./student.html");
});