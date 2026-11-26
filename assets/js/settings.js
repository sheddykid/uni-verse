import { supabase, requireProfile, showMessage, enablePasswordToggles } from "./supabase.js";

const session = await requireProfile();
if (session) {
  const { user, profile } = session;
  const $ = selector => document.querySelector(selector);
  $("#dashboard-link").href = profile.role === "admin" ? "./admin.html" : "./student.html";
  $("#user-label").textContent = user.email || "";
  $("#profile-name").textContent = profile.full_name || "Not provided";
  $("#profile-email").textContent = user.email || "Not available";
  $("#profile-matric").textContent = profile.matric_number || "Not provided";
  $("#profile-role").textContent = profile.role === "admin" ? "Administrator" : "Student";
  if (profile.department_id) {
    const { data } = await supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle();
    $("#profile-department").textContent = data?.name || "Not available";
  } else {
    $("#profile-department").textContent = "Not assigned";
  }

  enablePasswordToggles(document);
  $("#password-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.elements.password.value;
    const confirmation = form.elements.confirmPassword.value;
    const submit = form.querySelector('button[type="submit"]');
    if (password !== confirmation) {
      showMessage($("#password-status"), "The passwords do not match.");
      return;
    }
    submit.disabled = true;
    submit.textContent = "Updating…";
    showMessage($("#password-status"), "");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) showMessage($("#password-status"), error.message || "Password could not be updated.");
    else {
      showMessage($("#password-status"), "Password updated successfully.", true);
      form.reset();
    }
    submit.disabled = false;
    submit.textContent = "Update password";
  });

  const dialog = $("#delete-dialog");
  $("#open-delete-dialog").addEventListener("click", () => {
    $("#delete-status").textContent = "";
    $("#delete-password").value = "";
    $("#delete-confirmation").value = "";
    dialog.showModal();
  });
  $("#cancel-delete").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  $("#delete-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = form.elements.password.value;
    if (form.elements.confirmation.value.trim() !== "DELETE") {
      showMessage($("#delete-status"), "Type DELETE exactly to confirm.");
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Deleting account…";
    showMessage($("#delete-status"), "Verifying your password and deleting your account…");
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Account deletion failed. Please try again.");
      await supabase.auth.signOut({ scope: "local" });
      location.replace("./index.html?account=deleted");
    } catch (error) {
      showMessage($("#delete-status"), error.message || "Account deletion failed.");
      submit.disabled = false;
      submit.textContent = "Permanently delete";
    }
  });

  $("#sign-out").addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.replace("./index.html");
  });
}
