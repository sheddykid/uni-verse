import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export const supabase = createClient(
  "https://xcybjuwearndoljqkzmy.supabase.co",
  "sb_publishable_8egrnqtwHtrfzvtPcldiQw_y1Wqhh9w"
);
export function showMessage(element, message, success=false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("success", success);
}
export function enablePasswordToggles(root=document) {
  root.querySelectorAll('input[type="password"]').forEach(input => {
    if (input.dataset.toggleReady) return;
    input.dataset.toggleReady = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "password-wrap";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "password-toggle";
    toggle.textContent = "Show";
    toggle.setAttribute("aria-label", "Show password");
    toggle.setAttribute("aria-pressed", "false");
    toggle.addEventListener("click", () => {
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      toggle.textContent = reveal ? "Hide" : "Show";
      toggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
      toggle.setAttribute("aria-pressed", String(reveal));
    });
    wrapper.append(toggle);
  });
}
export async function requireProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { location.replace("./index.html"); return null; }
  const { data: profile, error } = await supabase.from("profiles").select("id,full_name,matric_number,role,department_id,is_verified").eq("id", user.id).single();
  if (error || !profile) { await supabase.auth.signOut(); location.replace("./index.html"); return null; }
  return { user, profile };
}
export async function signOut() {
  await supabase.auth.signOut();
  location.replace("./index.html");
}