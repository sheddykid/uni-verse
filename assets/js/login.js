import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";
const form = document.querySelector("#login-form");
enablePasswordToggles(form || document);
const confirmationNotice = new URLSearchParams(location.search).get("confirmed");
if (confirmationNotice === "1") {
  showMessage(document.querySelector("#message"), "Email confirmed. Sign in to open your UNI-VERSE student account.", true);
}
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const message = document.querySelector("#message");
  button.disabled = true;
  showMessage(message, "Signing in…");
  const email = document.querySelector("#email").value.trim();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: document.querySelector("#password").value
  });
  if (error) {
    showMessage(message, error.message);
    button.disabled = false;
    if (/email not confirmed/i.test(error.message)) {
      let resend = form.querySelector("#resend-confirmation");
      if (!resend) {
        resend = document.createElement("button");
        resend.type = "button";
        resend.id = "resend-confirmation";
        resend.className = "btn secondary";
        resend.textContent = "Resend confirmation email";
        form.insertBefore(resend, message);
        resend.addEventListener("click", async () => {
          resend.disabled = true;
          const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
          showMessage(message, resendError ? resendError.message : "Confirmation email sent. Check your inbox and spam folder.", !resendError);
          resend.disabled = false;
        });
      }
    }
    return;
  }
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    showMessage(message, "Your account profile is not ready. Contact an administrator.");
    button.disabled = false; return;
  }
  const currentPath = location.pathname.split("/").pop() || "";
  const adminPage = currentPath === "admin-login" || currentPath === "admin-login.html";
  if (adminPage && profile.role !== "admin") {
    await supabase.auth.signOut();
    showMessage(message, "This account does not have administrator access.");
    button.disabled = false; return;
  }
  location.replace(profile.role === "admin" ? "/admin" : "/student");
});