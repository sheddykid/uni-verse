import { supabase, requireProfile } from "./supabase.js";

const session = await requireProfile();
if (session && session.profile.role !== "admin") {
  location.replace("./student.html");
} else if (session) {
  const $ = selector => document.querySelector(selector);
  $("#user-label").textContent = session.profile.full_name || session.user.email;
  const pendingTarget = $("#pending-verifications");
  const cleanupTarget = $("#verification-cleanup-list");
  const status = $("#verification-admin-status");
  $("#refresh-verifications").addEventListener("click", loadRequests);

  function setStatus(message, success = false) {
    status.textContent = message;
    status.classList.toggle("success", success);
  }
  function createText(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value || "";
    return node;
  }
  function createButton(label, variant, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn " + variant;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  async function getStudentDetails(userIds) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return new Map();
    const { data, error } = await supabase.from("profiles")
      .select("id,full_name,matric_number,department_id")
      .in("id", unique);
    if (error) throw error;
    const departmentIds = [...new Set((data || []).map(item => item.department_id).filter(Boolean))];
    const departmentsResult = departmentIds.length
      ? await supabase.from("departments").select("id,name,code").in("id", departmentIds)
      : { data: [], error: null };
    if (departmentsResult.error) throw departmentsResult.error;
    const departments = new Map((departmentsResult.data || []).map(item => [item.id, item]));
    return new Map((data || []).map(item => [item.id, {
      ...item,
      department: departments.get(item.department_id)
    }]));
  }

  async function removeStudentImages(userId) {
    const { data, error } = await supabase.from("verification_requests")
      .select("file_path").eq("user_id", userId);
    if (error) throw error;
    const paths = [...new Set((data || []).map(item => item.file_path).filter(Boolean))];
    if (paths.length) {
      const removed = await supabase.storage.from("student-verification").remove(paths);
      if (removed.error) throw removed.error;
    }
    const cleared = await supabase.rpc("clear_student_verification_files", { p_user_id: userId });
    if (cleared.error) throw cleared.error;
  }

  async function approveRequest(request, button) {
    button.disabled = true;
    button.textContent = "Approving…";
    try {
      const reviewed = await supabase.rpc("review_student_verification", {
        p_request_id: request.id,
        p_decision: "approved",
        p_rejection_reason: null
      });
      if (reviewed.error) throw reviewed.error;
      try {
        await removeStudentImages(request.user_id);
        setStatus("Student approved. All submitted ID images have been deleted from active storage.", true);
      } catch (cleanupError) {
        setStatus("Student approved, but image cleanup is still pending: " + cleanupError.message);
      }
      await loadRequests();
    } catch (error) {
      setStatus(error.message || "The request could not be approved.");
      button.disabled = false;
      button.textContent = "Approve";
    }
  }

  async function rejectRequest(request, button) {
    const reason = prompt("Enter a reason for rejection. The student will see this when they return to the verification page:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Enter a short reason so the student knows what to correct.");
      return;
    }
    button.disabled = true;
    button.textContent = "Rejecting…";
    const result = await supabase.rpc("review_student_verification", {
      p_request_id: request.id,
      p_decision: "rejected",
      p_rejection_reason: reason.trim()
    });
    if (result.error) {
      setStatus(result.error.message || "The request could not be rejected.");
      button.disabled = false;
      button.textContent = "Reject";
      return;
    }
    setStatus("Verification request rejected. The student can submit a new ID image.", true);
    await loadRequests();
  }

  async function renderPending(requests, students) {
    pendingTarget.replaceChildren();
    if (!requests.length) {
      pendingTarget.append(createText("p", "muted", "There are no pending verification requests."));
      return;
    }
    for (const request of requests) {
      const student = students.get(request.user_id);
      const card = document.createElement("article");
      card.className = "verification-admin-card";
      const image = document.createElement("img");
      image.className = "verification-admin-image";
      image.alt = "Student ID card submitted for verification";
      const signed = await supabase.storage.from("student-verification").createSignedUrl(request.file_path, 600);
      if (signed.error || !signed.data?.signedUrl) {
        image.alt = "ID image unavailable: " + (signed.error?.message || "Could not create secure preview.");
        image.hidden = true;
      } else {
        image.src = signed.data.signedUrl;
      }
      const copy = document.createElement("div");
      copy.className = "verification-admin-copy";
      copy.append(
        createText("h3", "", student?.full_name || "Student profile unavailable"),
        createText("p", "verification-admin-meta", [
          "Matriculation number: " + (student?.matric_number || "Unavailable"),
          "Department: " + (student?.department?.name || "Unavailable"),
          "Submitted: " + new Date(request.created_at).toLocaleString()
        ].join("\n"))
      );
      const actions = document.createElement("div");
      actions.className = "verification-admin-actions";
      const approve = createButton("Approve", "primary", () => approveRequest(request, approve));
      const reject = createButton("Reject", "danger", () => rejectRequest(request, reject));
      actions.append(approve, reject);
      copy.append(actions);
      card.append(image, copy);
      pendingTarget.append(card);
    }
  }

  async function renderCleanup(requests, students) {
    cleanupTarget.replaceChildren();
    if (!requests.length) {
      cleanupTarget.append(createText("p", "muted", "No approved ID images are awaiting cleanup."));
      return;
    }
    for (const request of requests) {
      const student = students.get(request.user_id);
      const row = document.createElement("div");
      row.className = "verification-cleanup-row";
      row.append(createText("span", "", (student?.matric_number || "Student") + " · " + (student?.full_name || "Profile unavailable")));
      const retry = createButton("Delete remaining ID images", "secondary", async () => {
        retry.disabled = true;
        retry.textContent = "Cleaning…";
        try {
          await removeStudentImages(request.user_id);
          setStatus("Remaining ID images deleted.", true);
          await loadRequests();
        } catch (error) {
          setStatus("Image cleanup failed: " + error.message);
          retry.disabled = false;
          retry.textContent = "Try cleanup again";
        }
      });
      row.append(retry);
      cleanupTarget.append(row);
    }
  }

  async function loadRequests() {
    $("#refresh-verifications").disabled = true;
    pendingTarget.replaceChildren(createText("p", "muted", "Loading pending requests…"));
    cleanupTarget.replaceChildren(createText("p", "muted", "Checking image cleanup…"));
    try {
      const [pendingResult, cleanupResult] = await Promise.all([
        supabase.from("verification_requests")
          .select("id,user_id,file_path,created_at")
          .eq("status", "pending").order("created_at", { ascending: true }),
        supabase.from("verification_requests")
          .select("id,user_id,file_path,created_at")
          .eq("status", "approved").not("file_path", "is", null)
          .order("created_at", { ascending: false })
      ]);
      if (pendingResult.error) throw pendingResult.error;
      if (cleanupResult.error) throw cleanupResult.error;
      const students = await getStudentDetails([
        ...(pendingResult.data || []).map(item => item.user_id),
        ...(cleanupResult.data || []).map(item => item.user_id)
      ]);
      await renderPending(pendingResult.data || [], students);
      await renderCleanup(cleanupResult.data || [], students);
    } catch (error) {
      pendingTarget.replaceChildren(createText("p", "message", "Could not load verification requests: " + error.message));
      cleanupTarget.replaceChildren(createText("p", "muted", "Cleanup status is unavailable."));
    } finally {
      $("#refresh-verifications").disabled = false;
    }
  }

  await loadRequests();
}
