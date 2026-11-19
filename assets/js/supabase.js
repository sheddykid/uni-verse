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
export async function requireProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { location.replace("./index.html"); return null; }
  const { data: profile, error } = await supabase.from("profiles").select("id,full_name,matric_number,role,department_id").eq("id", user.id).single();
  if (error || !profile) { await supabase.auth.signOut(); location.replace("./index.html"); return null; }
  return { user, profile };
}
export async function signOut() {
  await supabase.auth.signOut();
  location.replace("./index.html");
}