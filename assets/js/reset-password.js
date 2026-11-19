import { supabase, showMessage } from "./supabase.js";

const requestForm = document.querySelector("#request-form");
const message = document.querySelector("#request-message");

requestForm.addEventListener("submit", async event => {
  event.preventDefault();

  const button = requestForm.querySelector('button[type="submit"]');
  const email = document.querySelector("#reset-email").value.trim();

  button.disabled = true;
  showMessage(message, "Sending reset link…");

  const redirectTo = new URL("./update-password.html", location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  showMessage(
    message,
    error
      ? error.message
      : "If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.",
    !error
  );

  button.disabled = false;
});