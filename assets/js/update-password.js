import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";

const updateForm = document.querySelector("#update-form");
const message = document.querySelector("#update-message");
const submitButton = updateForm.querySelector('button[type="submit"]');

let recoverySessionReady = false;
enablePasswordToggles();

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY" && session) {
    recoverySessionReady = true;
    updateForm.hidden = false;
    showMessage(message, "Your reset link is valid. Choose a new password.");
  }
});

updateForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!recoverySessionReady) {
    showMessage(message, "This password reset link is invalid or has expired. Request a new one.");
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
  showMessage(message, "Password updated successfully. You can now sign in with your new password.", true);
  recoverySessionReady = false;
  await supabase.auth.signOut();
  submitButton.disabled = false;
});