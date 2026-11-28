import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";

const updateForm = document.querySelector("#update-form");
const message = document.querySelector("#update-message");
const submitButton = updateForm.querySelector('button[type="submit"]');
let recoverySessionReady = false;
enablePasswordToggles();

async function checkRecoverySession() {
  if (sessionStorage.getItem("uniVerseRecoveryVerified") !== "1") {
    showMessage(message, "Request a password-reset code first, then verify it to continue.");
    return;
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    sessionStorage.removeItem("uniVerseRecoveryVerified");
    showMessage(message, "Your password-reset verification has expired. Request a new code.");
    return;
  }
  recoverySessionReady = true;
  updateForm.hidden = false;
  showMessage(message, "Your verification code is valid. Choose a new password.");
}
await checkRecoverySession();

updateForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!recoverySessionReady || sessionStorage.getItem("uniVerseRecoveryVerified") !== "1") {
    showMessage(message, "This password-reset session is invalid or has expired. Request a new code.");
    return;
  }
  const password = document.querySelector("#new-password").value;
  const confirm = document.querySelector("#confirm-password").value;
  if (password !== confirm) {
    showMessage(message, "Passwords do not match.");
    return;
  }
  submitButton.disabled = true;
  showMessage(message, "Updating password…");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    showMessage(message, error.message);
    submitButton.disabled = false;
    return;
  }
  updateForm.reset();
  updateForm.hidden = true;
  sessionStorage.removeItem("uniVerseRecoveryVerified");
  recoverySessionReady = false;
  await supabase.auth.signOut();
  showMessage(message, "Password updated successfully. You can now sign in with your new password.", true);
  submitButton.disabled = false;
});
