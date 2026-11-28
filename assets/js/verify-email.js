import { supabase, showMessage } from "./supabase.js";

const email = sessionStorage.getItem("uniVersePendingEmail") || "";
const message = document.querySelector("#message");
const form = document.querySelector("#verify-form");
const resendButton = document.querySelector("#resend-code");
const submitButton = form.querySelector('button[type="submit"]');
const otpInput = form.elements.otp;
const RESEND_SECONDS = 60;
const OTP_SECONDS = 10 * 60;
let resendTimer = null;
let expiryTimer = null;
let resendRemaining = 0;
let expiryRemaining = 0;

const description = document.querySelector("#verify-description");
description.textContent = email
  ? `Enter the six-digit code sent to ${email}. The code expires in 10 minutes.`
  : "Enter the six-digit code sent to the email address you registered with.";

const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function startExpiryCountdown() {
  clearInterval(expiryTimer);
  expiryRemaining = OTP_SECONDS;
  const update = () => {
    if (expiryRemaining <= 0) {
      clearInterval(expiryTimer);
      description.textContent = "Your code may have expired. Request a new code to continue.";
      return;
    }
    description.textContent = `Code sent to ${email}. Expires in ${formatTime(expiryRemaining)}.`;
    expiryRemaining -= 1;
  };
  update();
  expiryTimer = setInterval(update, 1000);
}

function startResendCooldown() {
  clearInterval(resendTimer);
  resendRemaining = RESEND_SECONDS;
  resendButton.disabled = true;
  const update = () => {
    if (resendRemaining <= 0) {
      clearInterval(resendTimer);
      resendButton.disabled = false;
      resendButton.textContent = "Resend code";
      return;
    }
    resendButton.textContent = `Resend code (${resendRemaining}s)`;
    resendRemaining -= 1;
  };
  update();
  resendTimer = setInterval(update, 1000);
}

if (!email) {
  showMessage(message, "Your registration email was not found. Please register again.");
  submitButton.disabled = true;
  resendButton.disabled = true;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const token = otpInput.value.trim();
  if (!/^\d{6}$/.test(token)) return showMessage(message, "Enter the six-digit code.");
  submitButton.disabled = true;
  showMessage(message, "Verifying your email…");
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) {
    showMessage(message, error.message || "That code could not be verified.");
    submitButton.disabled = false;
    return;
  }
  clearInterval(expiryTimer);
  clearInterval(resendTimer);
  sessionStorage.removeItem("uniVersePendingEmail");
  if (data.session) location.replace("./student.html");
  else location.replace("./index.html?verified=1");
});

resendButton.addEventListener("click", async () => {
  if (!email || resendRemaining > 0) return;
  resendButton.disabled = true;
  showMessage(message, "Sending a new code…");
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    showMessage(message, error.message || "Could not resend the code.");
    resendButton.disabled = false;
    resendButton.textContent = "Resend code";
    return;
  }
  otpInput.value = "";
  showMessage(message, "A new verification code has been sent.", true);
  startExpiryCountdown();
  startResendCooldown();
});

if (email) {
  startExpiryCountdown();
  startResendCooldown();
}
