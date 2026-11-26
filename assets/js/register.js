import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";
enablePasswordToggles();
const departmentSelect = document.querySelector("#department");
const message = document.querySelector("#message");
const termsCheckbox = document.querySelector("#verification-terms");

const { data: departments, error: deptError } = await supabase
  .from("departments").select("id,name,code").eq("is_active", true).order("name");

if (deptError) {
  showMessage(message, "Could not load departments: " + deptError.message);
} else {
  departmentSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select your department";
  departmentSelect.append(placeholder);

  departments.forEach(department => {
    const option = document.createElement("option");
    option.value = department.id;
    option.textContent = `${department.name} (${department.code})`;
    departmentSelect.append(option);
  });
}

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
  if (!termsCheckbox.checked) return showMessage(message, "You must accept the Terms and Conditions to register.");

  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(message, "Creating your account…");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: new URL("./index.html?confirmed=1", location.href).href,
      data: {
        full_name: name,
        matric_number: matric,
        department_id: departmentId,
        verification_terms_accepted: true
      }
    }
  });

  if (error) {
    showMessage(message, error.message);
    button.disabled = false;
    return;
  }

  showMessage(message, "Account created. Check your email and click the confirmation link. Once confirmed, sign in to access UNI-VERSE.", true);
  event.currentTarget.reset();
  button.disabled = false;
});