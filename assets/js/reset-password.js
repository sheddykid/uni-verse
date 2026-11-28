import { supabase, showMessage } from "./supabase.js";

const requestForm = document.querySelector("#request-form");
const verifyForm = document.querySelector("#verify-form");
const requestMessage = document.querySelector("#request-message");
const verifyMessage = document.querySelector("#verify-message");
const countdown = document.querySelector("#recovery-countdown");
const resendButton = document.querySelector("#resend-code");
const otpInput = document.querySelector("#recovery-otp");
const RESEND_SECONDS = 60;
const OTP_SECONDS = 10 * 60;
let email = "";
let resendRemaining = 0;
let expiryRemaining = 0;
let resendTimer = null;
let expiryTimer = null;

const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function startTimers() {
  clearInterval(resendTimer);
  clearInterval(expiryTimer);
  resendRemaining = RESEND_SECONDS;
  expiryRemaining = OTP_SECONDS;
  resendButton.disabled = true;
  const updateResend = () => {
    if (resendRemaining <= 0) {
      clearInterval(resendTimer);
      resendButton.disabled = false;
      resendButton.textContent = "Resend code";
      return;
    }
    resendButton.textContent = `Resend code (${resendRemaining}s)`;
    resendRemaining -= 1;
  };
  const updateExpiry = () => {
    if (expiryRemaining <= 0) {
      clearInterval(expiryTimer);
      countdown.textContent = "The code may have expired. Request a new one.";
      return;
    }
    countdown.textContent = `Code expires in ${formatTime(expiryRemaining)}.`;
    expiryRemaining -= 1;
  };
  updateResend();
  updateExpiry();
  resendTimer = setInterval(updateResend, 1000);
  expiryTimer = setInterval(updateExpiry, 1000);
}

async function sendRecoveryCode() {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
  verifyForm.hidden = false;
  requestForm.hidden = true;
  otpInput.value = "";
  showMessage(verifyMessage, "If an account exists for that email, a verification code has been sent.", true);
  startTimers();
}

requestForm.addEventListener("submit", async event => {
  event.preventDefault();
  email = document.querySelector("#reset-email").value.trim();
  const button = requestForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(requestMessage, "Sending verification code…");
  try {
    await sendRecoveryCode();
  } catch (error) {
    showMessage(requestMessage, error.message || "Could not send a verification code.");
    button.disabled = false;
  }
});

resendButton.addEventListener("click", async () => {
  if (!email || resendRemaining > 0) return;
  resendButton.disabled = true;
  showMessage(verifyMessage, "Sending another code…");
  try {
    await sendRecoveryCode();
  } catch (error) {
    showMessage(verifyMessage, error.message || "Could not resend the code.");
    resendButton.disabled = false;
    resendButton.textContent = "Resend code";
  }
});

verifyForm.addEventListener("submit", async event => {
  event.preventDefault();
  const token = otpInput.value.trim();
  if (!/^\d{6}$/.test(token)) return showMessage(verifyMessage, "Enter the six-digit code.");
  const button = verifyForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(verifyMessage, "Verifying your code…");
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error || !data.session) {
    showMessage(verifyMessage, error?.message || "The code could not be verified. Request a new code.");
    button.disabled = false;
    return;
  }
  clearInterval(resendTimer);
  clearInterval(expiryTimer);
  sessionStorage.setItem("uniVerseRecoveryVerified", "1");
  location.assign("./update-password.html");
});
