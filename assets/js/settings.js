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
    const currentPassword = form.elements.currentPassword.value;
    const password = form.elements.password.value;
    const confirmation = form.elements.confirmPassword.value;
    const submit = form.querySelector('button[type="submit"]');

    if (!currentPassword) return showMessage($("#password-status"), "Enter your current password.");
    if (password.length < 8) return showMessage($("#password-status"), "Your new password must be at least 8 characters.");
    if (password !== confirmation) return showMessage($("#password-status"), "The passwords do not match.");
    if (currentPassword === password) return showMessage($("#password-status"), "Choose a new password different from your current password.");

    submit.disabled = true;
    submit.textContent = "Verifying and updating…";
    showMessage($("#password-status"), "Verifying your current password…");

    try {
      const { error } = await supabase.auth.updateUser({
        password,
        current_password: currentPassword
      });
      if (error) throw error;
      showMessage($("#password-status"), "Password updated successfully.", true);
      form.reset();
    } catch (error) {
      showMessage($("#password-status"), error.message || "Password could not be updated.");
    } finally {
      submit.disabled = false;
      submit.textContent = "Update password";
    }
  });

  const dialog = $("#delete-dialog");
  $("#open-delete-dialog").addEventListener("click", () => {
    $("#delete-password").value = "";
    $("#delete-confirmation").value = "";
    showMessage($("#delete-status"), "");
    dialog.showModal();
  });
  $("#cancel-delete").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  $("#delete-form").addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("#delete-password").value;
    const confirmation = $("#delete-confirmation").value.trim();
    if (!password) return showMessage($("#delete-status"), "Enter your current password.");
    if (confirmation !== "DELETE") return showMessage($("#delete-status"), 'Type DELETE exactly to confirm account deletion.');

    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Verifying and deleting…";
    showMessage($("#delete-status"), "Verifying your password…");
    try {
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSession?.access_token) {
        throw new Error("Your session has expired. Sign in again.");
      }
      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({ password, confirmation })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account deletion failed. Please try again.");
      await supabase.auth.signOut({ scope: "local" });
      location.replace("./index.html?account=deleted");
    } catch (error) {
      showMessage($("#delete-status"), error.message || "Account deletion failed.");
      submit.disabled = false;
      submit.textContent = "Permanently delete my account";
    }
  });

  $("#sign-out").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.replace("./index.html");
  });
}