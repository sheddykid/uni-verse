import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";
enablePasswordToggles();
const departmentSelect = document.querySelector("#department");
const message = document.querySelector("#message");
const { data: departments, error: deptError } = await supabase.from("departments").select("id,name,code").eq("is_active", true).order("name");
if (deptError) showMessage(message, "Could not load departments: " + deptError.message);
else departmentSelect.innerHTML = '<option value="">Select your department</option>' + departments.map(d => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("");
document.querySelector("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#full-name").value.trim();
  const matric = document.querySelector("#matric").value.trim().toUpperCase();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const confirm = document.querySelector("#confirm-password").value;
  const departmentId = departmentSelect.value;
  if (password !== confirm) return showMessage(message, "Passwords do not match.");
  if (!departmentId) return showMessage(message, "Select your department.");
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; showMessage(message, "Creating your account…");
  const { error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: new URL("./index.html", location.href).href,
      data: { full_name: name, matric_number: matric, department_id: departmentId }
    }
  });
  if (error) { showMessage(message, error.message); button.disabled = false; return; }
  showMessage(message, "Registration submitted. Check your email to confirm your account before signing in.", true);
  event.currentTarget.reset();
  button.disabled = false;
});