import { supabase, showMessage } from "./supabase.js";

const email = sessionStorage.getItem("uniVersePendingEmail") || "";
const message = document.querySelector("#message");
const form = document.querySelector("#verify-form");
const resendButton = document.querySelector("#resend-code");
document.querySelector("#verify-description").textContent = email
  ? `Enter the six-digit code sent to ${email}.`
  : "Enter the six-digit code sent to the email address you registered with.";

if (!email) {
  showMessage(message, "Your registration email was not found. Please register again.");
  form.querySelector('button[type="submit"]').disabled = true;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const token = form.elements.otp.value.trim();
  if (!/^\d{6}$/.test(token)) return showMessage(message, "Enter the six-digit code.");
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  showMessage(message, "Verifying your email…");
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) {
    showMessage(message, error.message || "That code could not be verified.");
    submit.disabled = false;
    return;
  }
  sessionStorage.removeItem("uniVersePendingEmail");
  if (data.session) location.replace("./student.html");
  else location.replace("./index.html?verified=1");
});

resendButton.addEventListener("click", async () => {
  if (!email) return showMessage(message, "Register again to request a new code.");
  resendButton.disabled = true;
  showMessage(message, "Sending a new code…");
  const { error } = await supabase.auth.resend({ type: "signup", email });
  showMessage(message, error ? (error.message || "Could not resend the code.") : "A new verification code has been sent.", !error);
  resendButton.disabled = false;
});
