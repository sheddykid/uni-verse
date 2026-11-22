import { supabase, requireProfile, signOut } from "./supabase.js";

// Capture policy details for media rejections without exposing signed playback URL parameters.
let latestMediaCspViolation = null;
document.addEventListener("securitypolicyviolation", event => {
  const directive = event.effectiveDirective || event.violatedDirective || "";
  const blocked = String(event.blockedURI || "");
  if (directive.includes("media-src") || blocked.includes("r2.cloudflarestorage.com")) {
    let blockedOrigin = null;
    try {
      blockedOrigin = new URL(blocked).origin;
    } catch {
      blockedOrigin = blocked === "inline" || blocked === "eval" ? blocked : null;
    }
    latestMediaCspViolation = {
      effectiveDirective: event.effectiveDirective || null,
      violatedDirective: event.violatedDirective || null,
      blockedOrigin,
      disposition: event.disposition || null,
      originalPolicy: event.originalPolicy || null,
      documentURI: event.documentURI || null,
      referrer: event.referrer || null,
      sourceFile: event.sourceFile || null,
      lineNumber: event.lineNumber || null,
      columnNumber: event.columnNumber || null,
      statusCode: Number.isFinite(event.statusCode) ? event.statusCode : null
    };
  }
});

document.querySelector("#logout")?.addEventListener("click", signOut);
const session = await requireProfile();

if (session) {
  const userLabel = document.querySelector("#user-label");
  if (userLabel) userLabel.textContent = session.profile.full_name || session.user.email;
  const searchInput = document.querySelector("#video-search");
  const courseFilter = document.querySelector("#video-course-filter");
  const target = document.querySelector("#video-list");
  const count = document.querySelector("#video-count");
  async function inspectBrowserVideoAccess(url) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
        cache: "no-store"
      });
      const bytes = await response.arrayBuffer();
      return {
        ok: response.ok,
        status: response.status,
        responseType: response.type,
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        contentRange: response.headers.get("content-range"),
        acceptRanges: response.headers.get("accept-ranges"),
        bytesReceived: bytes.byteLength,
        urlHost: new URL(url).host,
        rangeRequest: "bytes=0-1"
      };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        errorName: error?.name || "UnknownError",
        urlHost: (() => { try { return new URL(url).host; } catch { return null; } })(),
        urlProtocol: (() => { try { return new URL(url).protocol; } catch { return null; } })(),
        likelyCorsOrNetworkFailure: true,
        rangeRequest: "bytes=0-1"
      };
    }
  }

  async function getVideoPlaybackUrl(video) {
    if (!video.video_path.startsWith("r2/")) {
      const { data, error } = await supabase.storage.from("course-videos")
        .createSignedUrl(video.video_path, 3600);
      if (error || !data?.signedUrl) throw new Error(error?.message || "A secure video link could not be created.");
      return { url: data.signedUrl, diagnostics: null };
    }
    const { data: { session: authSession }, error } = await supabase.auth.getSession();
    if (error || !authSession?.access_token) throw new Error("Your session expired. Sign in again.");
    const response = await fetch("/api/course-videos", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authSession.access_token },
      body: JSON.stringify({ action: "playback", videoId: video.id })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || "A secure video link could not be created.");
    return { url: result.url, diagnostics: result.diagnostics || null };
  }


  const [uploadedResult, youtubeResult] = await Promise.all([
    supabase.from("course_videos")
      .select("id,course_id,title,description,topic,video_path,file_name,mime_type,created_at,courses(code,title)")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase.from("course_video_links")
      .select("id,course_id,title,description,topic,youtube_url,created_at,courses(code,title)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
  ]);

  if (uploadedResult.error || youtubeResult.error) {
    const loadError = uploadedResult.error || youtubeResult.error;
    target.textContent = "Video tutorials could not be loaded. " + loadError.message;
    count.textContent = "Video library unavailable";
  } else {
    const videoSourceFilter = document.body.dataset.videoSource || "upload";
    const videos = (videoSourceFilter === "youtube"
      ? (youtubeResult.data || []).map(video => ({ ...video, source: "youtube" }))
      : (uploadedResult.data || []).map(video => ({ ...video, source: "upload" }))
    ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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

    function getYouTubeId(value) {
      let url;
      try { url = new URL(value); } catch { return null; }
      if (url.protocol !== "https:") return null;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      let id = null;
      if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0];
      else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1];
      }
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    let activeVideoPlayer = null;
    let activeYoutubeFrame = null;
    let activeHideButton = null;

    function closeActiveVideo() {
      if (activeYoutubeFrame) {
        activeYoutubeFrame.src = "about:blank";
        activeYoutubeFrame.hidden = true;
      }
      activeYoutubeFrame = null;
      if (activeVideoPlayer) {
        activeVideoPlayer.pause();
        activeVideoPlayer.removeAttribute("src");
        activeVideoPlayer.load();
        activeVideoPlayer.hidden = true;
      }
      if (activeHideButton) activeHideButton.hidden = true;
      activeVideoPlayer = null;
      activeHideButton = null;
    }

    function renderVideos() {
      closeActiveVideo();
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

        if (video.source === "youtube") {
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
          meta.textContent = "YouTube · " + new Date(video.created_at).toLocaleDateString();
          body.append(meta);

          const frame = document.createElement("iframe");
          frame.className = "video-player youtube-video-player";
          frame.title = video.title;
          frame.loading = "lazy";
          frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
          frame.referrerPolicy = "strict-origin-when-cross-origin";
          frame.allowFullscreen = true;
          frame.hidden = true;
          const actions = document.createElement("div");
          actions.className = "video-card-actions";
          const playButton = document.createElement("button");
          playButton.type = "button";
          playButton.className = "btn primary";
          playButton.textContent = "▶ Watch video";
          playButton.addEventListener("click", () => {
            if (activeVideoPlayer || activeYoutubeFrame) closeActiveVideo();
            const id = getYouTubeId(video.youtube_url);
            if (!id) {
              const error = document.createElement("p");
              error.className = "message video-play-error";
              error.textContent = "This YouTube link is invalid.";
              body.append(error);
              return;
            }
            frame.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
            frame.hidden = false;
            activeYoutubeFrame = frame;
            playButton.textContent = "▶ Playing video";
          });
          actions.append(playButton);
          body.append(actions);
          card.append(frame, body);
          target.append(card);
          return;
        }

        const player = document.createElement("video");
        player.className = "video-player";
        player.controls = true;
        player.playsInline = true;
        player.preload = "none";
        player.hidden = true;
        player.setAttribute("aria-label", video.title);
        let playbackDiagnostics = null;
        let browserAccessDiagnostics = null;
        let playbackUrlHost = null;
        function getBrowserMediaDiagnostics() {
          let currentSrcHost = null;
          try {
            if (player.currentSrc) currentSrcHost = new URL(player.currentSrc).host;
          } catch {}
          return {
            mediaErrorCode: player.error?.code ?? null,
            mediaErrorMessage: player.error?.message || null,
            networkState: player.networkState,
            readyState: player.readyState,
            currentSrcHost,
            playbackUrlHost,
            h264AacSupport: player.canPlayType('video/mp4; codecs="avc1.4D401E, mp4a.40.2"'),
            mediaCspViolation: latestMediaCspViolation
          };
        }
        ["loadedmetadata", "loadeddata", "stalled", "abort", "waiting", "canplay"].forEach(eventName => {
          player.addEventListener(eventName, () => {
            console.info("[UNI-VERSE video element event]", eventName, getBrowserMediaDiagnostics());
          });
        });
        player.addEventListener("error", async () => {
          const code = player.error?.code;
          const reasons = {
            1: "Playback was aborted.",
            2: "A network error interrupted video playback.",
            3: "The browser could not decode the video data.",
            4: "The video format or source is not supported."
          };
          const detail = reasons[code] || "The browser could not load this video.";
          let error = body.querySelector(".video-play-error");
          if (!error) {
            error = document.createElement("p");
            error.className = "message video-play-error";
            body.append(error);
          }
          const storageDetail = playbackDiagnostics
            ? " R2 check: " + (playbackDiagnostics.rangeSupported ? "byte-range OK" : "byte-range failed") +
              "; stored size " + (Number(playbackDiagnostics.contentLength || 0) / 1048576).toFixed(1) + " MB."
            : "";
          const browserDetail = browserAccessDiagnostics
            ? "\\nBrowser R2 access test: " + JSON.stringify(browserAccessDiagnostics)
            : "\\nBrowser R2 access test: not completed";
          const mediaDetail = "\\nBrowser media diagnostics: " + JSON.stringify(getBrowserMediaDiagnostics());
          error.textContent = detail + (code ? " (Media error " + code + ")." : "") + storageDetail + browserDetail + mediaDetail;

          // Admin-only one-time integrity inspection of the existing R2 object.
          if (session.profile?.role === "admin" && video.video_path.startsWith("r2/") &&
              !player.dataset.integrityInspectionStarted) {
            player.dataset.integrityInspectionStarted = "true";
            try {
              const { data: { session: authSession } } = await supabase.auth.getSession();
              if (!authSession?.access_token) throw new Error("Admin session unavailable.");
              const response = await fetch("/api/course-videos", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + authSession.access_token
                },
                body: JSON.stringify({ action: "inspect-object", videoId: video.id })
              });
              const inspection = await response.json().catch(() => ({}));
              if (!response.ok || !inspection.inspected) {
                throw new Error(inspection.error || "R2 inspection failed.");
              }
              const report = [
                "R2 integrity inspection:",
                "Actual size: " + inspection.actualSize + " bytes",
                "Database size matches: " + inspection.sizeMatchesDatabase,
                "R2 HEAD size matches: " + inspection.headSizeMatches,
                "MP4 container signature: " + inspection.isMp4Container,
                "MP4 boxes: " + (inspection.topLevelBoxes || []).map(box => box.type + "@" + box.offset).join(", "),
                "Movie metadata (moov) found: " + inspection.moovFound,
                "Tracks: " + JSON.stringify(inspection.tracks || []),
                "Signed URL HTTP status: " + inspection.signedUrlStatus,
                "Signed URL Content-Type: " + inspection.signedUrlContentType,
                "Signed URL Content-Range: " + inspection.signedUrlContentRange,
                "Signed URL range bytes returned: " + inspection.signedUrlRangeBytes,
                "R2 range verified: " + inspection.r2RangeVerified,
                "Stored Content-Type: " + (inspection.storedContentType || "missing"),
                "SHA-256: " + inspection.sha256
              ].join("\\n");
              error.textContent += "\\n" + report;
              console.info("[UNI-VERSE R2 integrity inspection]", inspection);
            } catch (inspectionError) {
              error.textContent += "\\nR2 integrity inspection failed: " +
                (inspectionError.message || "Unknown error.");
              console.error("[UNI-VERSE R2 integrity inspection]", inspectionError);
            }
          }
        });

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
        meta.textContent = new Date(video.created_at).toLocaleDateString();
        body.append(meta);

        const actions = document.createElement("div");
        actions.className = "video-card-actions";
        const hideButton = document.createElement("button");
        hideButton.type = "button";
        hideButton.className = "btn secondary";
        hideButton.textContent = "Hide video";
        hideButton.hidden = true;
        hideButton.addEventListener("click", () => {
          if (activeVideoPlayer === player) closeActiveVideo();
        });

        const playButton = document.createElement("button");
        playButton.type = "button";
        playButton.className = "btn primary";
        playButton.textContent = "▶ Watch video";
        playButton.addEventListener("click", async () => {
          if ((activeVideoPlayer && activeVideoPlayer !== player) || activeYoutubeFrame) closeActiveVideo();
          playButton.disabled = true;
          playButton.textContent = "Preparing video…";
          try {
            const playback = await getVideoPlaybackUrl(video);
            playbackDiagnostics = playback.diagnostics;
            try { playbackUrlHost = new URL(playback.url).host; } catch { playbackUrlHost = null; }
            if (playback.diagnostics) {
              console.info("[UNI-VERSE video diagnostics]", {
                title: video.title,
                expectedSize: video.file_size,
                ...playback.diagnostics
              });
            }
            // Verify that this browser can fetch the signed R2 URL with a byte-range request.
            // This distinguishes browser CORS/network failures from server-side R2 checks.
            browserAccessDiagnostics = await inspectBrowserVideoAccess(playback.url);
            console.info("[UNI-VERSE browser R2 access test]", {
              title: video.title,
              ...browserAccessDiagnostics
            });
            player.src = playback.url;
            player.hidden = false;
            activeVideoPlayer = player;
            activeHideButton = hideButton;
            hideButton.hidden = false;
            playButton.textContent = "▶ Play again";
            try {
              await player.play();
            } catch (error) {
              // Autoplay can be rejected independently of media loading; keep native controls available.
              console.warn("[UNI-VERSE video play request]", error?.name || error?.message || error);
            }
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
        actions.append(playButton, hideButton);
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
