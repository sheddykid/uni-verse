import { supabase, requireProfile, signOut } from "./supabase.js";

document.querySelector("#logout").addEventListener("click", signOut);
const session = await requireProfile();

if (session) {
  document.querySelector("#user-label").textContent = session.profile.full_name || session.user.email;
  const searchInput = document.querySelector("#video-search");
  const courseFilter = document.querySelector("#video-course-filter");
  const target = document.querySelector("#video-list");
  const count = document.querySelector("#video-count");

  const { data, error } = await supabase.from("course_videos")
    .select("id,course_id,title,description,topic,video_path,file_name,mime_type,file_size,created_at,courses(code,title)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    target.textContent = "Video tutorials could not be loaded. " + error.message;
    count.textContent = "Video library unavailable";
  } else {
    const videos = data || [];
    const courses = new Map();
    videos.forEach(video => {
      if (video.courses && !courses.has(video.course_id)) courses.set(video.course_id, video.courses);
    });
    [...courses.entries()].sort((a, b) => (a[1].code || "").localeCompare(b[1].code || "")).forEach(([id, course]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = course.code + " — " + course.title;
      courseFilter.append(option);
    });

    function renderVideos() {
      const query = searchInput.value.trim().toLowerCase();
      const courseId = courseFilter.value;
      const visible = videos.filter(video => {
        const course = video.courses || {};
        const matchesCourse = !courseId || video.course_id === courseId;
        const haystack = [video.title, video.description, video.topic, course.code, course.title, video.file_name]
          .filter(Boolean).join(" ").toLowerCase();
        return matchesCourse && (!query || haystack.includes(query));
      });

      count.textContent = visible.length + (visible.length === 1 ? " video available" : " videos available");
      target.replaceChildren();
      if (!visible.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = videos.length
          ? "No videos match your search. Try another title, topic or course."
          : "No video tutorials have been uploaded for your available courses yet.";
        target.append(empty);
        return;
      }

      visible.forEach(video => {
        const card = document.createElement("article");
        card.className = "video-card";
        const player = document.createElement("video");
        player.className = "video-player";
        player.controls = true;
        player.playsInline = true;
        player.preload = "none";
        player.hidden = true;
        player.setAttribute("aria-label", video.title);

        const body = document.createElement("div");
        body.className = "video-card-body";
        const courseLabel = document.createElement("p");
        courseLabel.className = "course-code";
        courseLabel.textContent = video.courses?.code
          ? video.courses.code + " · " + (video.courses.title || "")
          : "Course tutorial";
        const title = document.createElement("h3");
        title.textContent = video.title;
        body.append(courseLabel, title);

        if (video.topic) {
          const topic = document.createElement("span");
          topic.className = "video-card-topic";
          topic.textContent = video.topic;
          body.append(topic);
        }
        if (video.description) {
          const description = document.createElement("p");
          description.className = "video-card-description";
          description.textContent = video.description;
          body.append(description);
        }

        const meta = document.createElement("p");
        meta.className = "resource-meta";
        meta.textContent = (video.file_size / 1048576).toFixed(1) + " MB · " +
          new Date(video.created_at).toLocaleDateString();
        body.append(meta);

        const actions = document.createElement("div");
        actions.className = "video-card-actions";
        const playButton = document.createElement("button");
        playButton.type = "button";
        playButton.className = "btn primary";
        playButton.textContent = "▶ Watch video";
        playButton.addEventListener("click", async () => {
          playButton.disabled = true;
          playButton.textContent = "Preparing video…";
          try {
            if (!player.src) {
              const { data: signed, error: signedError } = await supabase.storage
                .from("course-videos").createSignedUrl(video.video_path, 3600);
              if (signedError || !signed?.signedUrl) {
                throw new Error(signedError?.message || "A secure video link could not be created.");
              }
              player.src = signed.signedUrl;
              player.hidden = false;
            }
            playButton.textContent = "▶ Play again";
            await player.play().catch(() => {});
          } catch (playError) {
            playButton.textContent = "Try again";
            const error = document.createElement("p");
            error.className = "message";
            error.textContent = "This video could not be opened: " + (playError.message || "Please try again.");
            if (!body.querySelector(".video-play-error")) {
              error.classList.add("video-play-error");
              body.append(error);
            }
          } finally {
            playButton.disabled = false;
          }
        });
        actions.append(playButton);
        body.append(actions);
        card.append(player, body);
        target.append(card);
      });
    }

    searchInput.addEventListener("input", renderVideos);
    courseFilter.addEventListener("change", renderVideos);
    renderVideos();
  }
}
