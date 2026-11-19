import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";
const requestForm = document.querySelector("#request-form");
const updateForm = document.querySelector("#update-form");
enablePasswordToggles();
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY" && session) {
    requestForm.hidden = true;
    updateForm.hidden = false;
  }
});
requestForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = requestForm.querySelector('button[type="submit"]');
  const email = document.querySelector("#reset-email").value.trim();
  button.disabled = true;
  showMessage(document.querySelector("#request-message"), "Sending reset link…");
  const redirectTo = new URL("./reset-password.html", location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  showMessage(document.querySelector("#request-message"),
    error ? error.message : "If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.",
    !error
  );
  button.disabled = false;
});
updateForm.addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.querySelector("#new-password").value;
  const confirm = document.querySelector("#confirm-password").value;
  const message = document.querySelector("#update-message");
  if (password !== confirm) return showMessage(message, "Passwords do not match.");
  const button = updateForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(message, "Updating password…");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    showMessage(message, error.message);
    button.disabled = false;
    return;
  }
  showMessage(message, "Password updated successfully. You can now sign in with your new password.", true);
  updateForm.reset();
  button.disabled = false;
});