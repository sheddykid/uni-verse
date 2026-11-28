import { supabase, showMessage, enablePasswordToggles } from "./supabase.js";
enablePasswordToggles();
const departmentSelect = document.querySelector("#department");
const message = document.querySelector("#message");

const hasRequiredPasswordCharacters = password =>
  /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) &&
  [..."!@#$%^&*()_+-=[]{};'\"\\:|<>?,./`~"].some(character => password.includes(character));


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

document.querySelector("#register-form").addEventListener("submit", async event => {
  event.preventDefault();
  const name = document.querySelector("#full-name").value.trim();
  const matric = document.querySelector("#matric").value.trim().toUpperCase();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const confirm = document.querySelector("#confirm-password").value;
  const departmentId = departmentSelect.value;
  const termsAccepted = document.querySelector("#terms-accepted").checked;

  if (password.length < 8) return showMessage(message, "Password must be at least 8 characters.");
  if (!hasRequiredPasswordCharacters(password)) return showMessage(message, "Include at least one lowercase letter, one uppercase letter, one number, and one special character.");
  if (password !== confirm) return showMessage(message, "Passwords do not match.");
  if (!departmentId) return showMessage(message, "Select your department.");
  if (!termsAccepted) return showMessage(message, "You must accept the Terms and Conditions to register.");

  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(message, "Creating your account…");
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, matric_number: matric, department_id: departmentId, verification_terms_accepted: true }
    }
  });
  if (error) {
    showMessage(message, error.message);
    button.disabled = false;
    return;
  }
  sessionStorage.setItem("uniVersePendingEmail", email);
  location.assign("./verify-email.html");
});
