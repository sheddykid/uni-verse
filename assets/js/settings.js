import { supabase, requireProfile, showMessage, enablePasswordToggles } from "./supabase.js";

const session = await requireProfile();
if (session) {
  const { user, profile } = session;
  const $ = selector => document.querySelector(selector);
  $("#dashboard-link").href = profile.role === "admin" ? "./admin.html" : "./student.html";
  $("#user-label").textContent = user.email || "";
  $("#profile-name").textContent = profile.full_name || "Not provided";
  $("#profile-full-name").value = profile.full_name || "";
  $("#profile-email").textContent = user.email || "Not available";
  $("#profile-matric").textContent = profile.matric_number || "Not provided";
  $("#profile-role").textContent = profile.role === "admin" ? "Administrator" : "Student";
  if (profile.department_id) {
    const { data } = await supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle();
    $("#profile-department").textContent = data?.name || "Not available";
  } else $("#profile-department").textContent = "Not assigned";

  $("#profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fullName = form.elements.fullName.value.trim();
    const submit = form.querySelector('button[type="submit"]');
    if (!fullName) return showMessage($("#profile-status"), "Enter your full name.");
    submit.disabled = true; submit.textContent = "Saving…"; showMessage($("#profile-status"), "");
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) showMessage($("#profile-status"), error.message || "Profile could not be updated.");
    else { $("#profile-name").textContent = fullName; showMessage($("#profile-status"), "Your name has been updated.", true); }
    submit.disabled = false; submit.textContent = "Save profile changes";
  });

  enablePasswordToggles(document);
  $("#password-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.elements.password.value;
    const confirmation = form.elements.confirmPassword.value;
    const submit = form.querySelector('button[type="submit"]');
    if (password !== confirmation) return showMessage($("#password-status"), "The passwords do not match.");
    submit.disabled = true; submit.textContent = "Updating…"; showMessage($("#password-status"), "");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) showMessage($("#password-status"), error.message || "Password could not be updated.");
    else { showMessage($("#password-status"), "Password updated successfully.", true); form.reset(); }
    submit.disabled = false; submit.textContent = "Update password";
  });

  const dialog = $("#delete-dialog");
  let deleteOtpEmail = "";
  let resendRemaining = 0;
  let resendTimer = null;
  $("#delete-email").textContent = user.email || "";
  $("#open-delete-dialog").addEventListener("click", () => {
    deleteOtpEmail = "";
    $("#delete-password").value = "";
    $("#delete-otp").value = "";
    $("#delete-request-step").hidden = false;
    $("#delete-verify-step").hidden = true;
    $("#send-delete-code").disabled = false;
    showMessage($("#delete-status"), "");
    dialog.showModal();
  });
  $("#cancel-delete").addEventListener("click", () => { clearInterval(resendTimer); dialog.close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) { clearInterval(resendTimer); dialog.close(); } });

  function startResendCooldown() {
    clearInterval(resendTimer);
    resendRemaining = 60;
    const button = $("#resend-delete-code");
    button.disabled = true;
    const tick = () => {
      if (resendRemaining <= 0) { clearInterval(resendTimer); button.disabled = false; button.textContent = "Resend code"; return; }
      button.textContent = `Resend code (${resendRemaining}s)`;
      resendRemaining -= 1;
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  async function sendDeletionCode(isResend = false) {
    const button = isResend ? $("#resend-delete-code") : $("#send-delete-code");
    if (isResend && resendRemaining > 0) return;
    button.disabled = true;
    showMessage($("#delete-status"), "Sending a confirmation code to your email…");
    const { error } = await supabase.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
    if (error) {
      showMessage($("#delete-status"), error.message || "Could not send the confirmation code.");
      button.disabled = false;
      return;
    }
    deleteOtpEmail = user.email;
    $("#delete-request-step").hidden = true;
    $("#delete-verify-step").hidden = false;
    showMessage($("#delete-status"), "A six-digit code has been sent. It expires after 10 minutes.", true);
    startResendCooldown();
  }
  $("#send-delete-code").addEventListener("click", () => sendDeletionCode(false));
  $("#resend-delete-code").addEventListener("click", () => sendDeletionCode(true));

  $("#delete-form").addEventListener("submit", async event => {
    event.preventDefault();
    const token = $("#delete-otp").value.trim();
    const password = $("#delete-password").value;
    if (!password) return showMessage($("#delete-status"), "Enter your current password.");
    if (!deleteOtpEmail || !/^\d{6}$/.test(token)) return showMessage($("#delete-status"), "Enter the six-digit code sent to your email.");
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Verifying and deleting…";
    showMessage($("#delete-status"), "Verifying your email code and current password…");
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: deleteOtpEmail, token, type: "email" });
      if (error || !data.session || data.user?.id !== user.id) throw new Error(error?.message || "The code could not be verified for this account. Request a new code.");
      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account deletion failed. Please try again.");
      clearInterval(resendTimer);
      await supabase.auth.signOut({ scope: "local" });
      location.replace("./index.html?account=deleted");
    } catch (error) {
      showMessage($("#delete-status"), error.message || "Account deletion failed.");
      submit.disabled = false; submit.textContent = "Verify password and code, then delete";
    }
  });

  $("#sign-out").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.replace("./index.html");
  });
}