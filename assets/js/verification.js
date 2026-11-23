import { supabase, requireProfile } from "./supabase.js";

const session = await requireProfile();
if (session) {
  const { user, profile } = session;
  if (profile.role === "admin") {
    location.replace("./admin.html");
  } else {
    document.querySelector("#user-label").textContent = profile.full_name || user.email;
    const status = document.querySelector("#verification-status");
    const form = document.querySelector("#verification-form");
    const fileInput = document.querySelector("#student-id-image");
    const preview = document.querySelector("#verification-preview");
    const message = document.querySelector("#verification-message");
    const submit = document.querySelector("#verification-submit");
    let previewUrl = null;

    function setMessage(value, success = false) {
      message.textContent = value;
      message.classList.toggle("success", success);
    }

    function showStatus(value) {
      status.textContent = value;
      status.hidden = false;
    }

    async function loadRequests() {
      const { data, error } = await supabase.from("verification_requests")
        .select("id,status,rejection_reason,file_path,created_at,reviewed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    }

    try {
      if (profile.is_verified) {
        showStatus("Your student account has been verified. You now have access to all student learning features.");
        form.hidden = true;
      } else {
        const requests = await loadRequests();
        const pending = requests.find(item => item.status === "pending");
        if (pending) {
          showStatus("Your ID card has been submitted and is awaiting administrator review. You do not need to submit it again.");
          form.hidden = true;
        } else {
          const latestRejected = requests.find(item => item.status === "rejected");
          if (latestRejected) {
            showStatus("Your previous verification submission was not approved. " +
              (latestRejected.rejection_reason || "Please submit a clearer image of your university ID card.") +
              " You can upload a new image below.");
          } else {
            showStatus("No verification request has been submitted yet. Upload your university ID card below.");
          }
          form.hidden = false;
        }
      }
    } catch (error) {
      showStatus("Your verification status could not be loaded. Refresh the page and try again.");
      console.error("[UNI-VERSE verification]", error);
    }

    fileInput.addEventListener("change", () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      const file = fileInput.files?.[0];
      if (!file) { preview.hidden = true; preview.removeAttribute("src"); return; }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setMessage("Choose a JPG, PNG or WEBP image no larger than 5 MB.");
        fileInput.value = "";
        preview.hidden = true;
        return;
      }
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.hidden = false;
      setMessage("");
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const file = fileInput.files?.[0];
      if (!file) return setMessage("Choose your university ID card image first.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        return setMessage("Choose a JPG, PNG or WEBP image no larger than 5 MB.");
      }
      submit.disabled = true;
      submit.textContent = "Submitting…";
      setMessage("Uploading your ID card securely…");
      try {
        const previous = await loadRequests();
        const rejectedPaths = previous.filter(item => item.status === "rejected" && item.file_path).map(item => item.file_path);
        if (rejectedPaths.length) {
          const cleanup = await supabase.storage.from("student-verification").remove([...new Set(rejectedPaths)]);
          if (cleanup.error) throw new Error("Could not clear your previous rejected image. Please try again. " + cleanup.error.message);
        }

        const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
        const filePath = user.id + "/" + crypto.randomUUID() + "." + extension;
        const upload = await supabase.storage.from("student-verification").upload(filePath, file, {
          cacheControl: "0",
          contentType: file.type,
          upsert: false
        });
        if (upload.error) throw upload.error;

        const inserted = await supabase.from("verification_requests")
          .insert({ user_id: user.id, file_path: filePath })
          .select("id")
          .single();
        if (inserted.error) {
          await supabase.storage.from("student-verification").remove([filePath]);
          throw inserted.error;
        }

        showStatus("Your ID card has been submitted successfully and is awaiting administrator review.");
        form.hidden = true;
        setMessage("");
      } catch (error) {
        console.error("[UNI-VERSE verification submission]", error);
        setMessage(error.message || "Your ID card could not be submitted. Please try again.");
      } finally {
        submit.disabled = false;
        submit.textContent = "Submit for verification";
      }
    });
  }
}
