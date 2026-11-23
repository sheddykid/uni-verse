# UNI-VERSE

## Contents

- [Current service status](#current-service-status)
- [Features](#features)
- [Application pages](#application-pages)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [How the application works](#how-the-application-works)
- [Local development](#local-development)
- [Supabase setup](#supabase-setup)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Current scope and limitations](#current-scope-and-limitations)
- [Implementation history and verification](#implementation-history-and-verification)
- [Contributing and maintenance](#contributing-and-maintenance)

## Current service status

> **AI Note Summarizer temporarily unavailable.** Summary generation is paused while provider reliability and request-timeout issues are investigated. The Generate Summary control is removed during this maintenance period. Existing saved summaries and Summary history remain available.

Flashcards and quizzes are separate features and are not disabled by this notice.

**UNI-VERSE** is a web-based learning platform for Covenant University students. It brings course information and academic learning materials into one place, allowing students to access notes and past questions for courses assigned to their department. Administrators manage departments' course catalogues and publish learning resources through a separate content-management area.

- **Live application (Vercel):** https://uni-verse-sheddykid.vercel.app
- **GitHub repository:** https://github.com/sheddykid/uni-verse
- **GitHub Pages deployment:** https://sheddykid.github.io/uni-verse/

---

## 1. Features

### Student features
- **Account registration:** Students create an account with their full name, matriculation number, email address, department and password.
- **Email confirmation:** New accounts must confirm their email address before signing in. The sign-in page also provides a way to resend a confirmation email when needed.
- **Secure sign-in and sign-out:** Supabase Authentication manages student sessions.
- **Department-based course listing:** Students see active courses assigned to their registered department.
- **Feature hub:** The student dashboard links to dedicated pages for notes, past questions, quizzes, flashcards, AI Note Summarizer, and video tutorials.
- **Learning resources:** Notes, past questions, uploaded videos and YouTube videos have dedicated searchable pages. Notes and past questions are course-filtered; past questions also support Test/Exam filtering. Video Tutorials in the student navigation drawer separates uploaded videos from YouTube videos.
- **Past-question details:** Resources can identify test or examination questions and optionally include the academic year and semester.
- **Downloads and video playback:** Students can download course files and stream course-specific videos. Image-based past questions can also be previewed in the dashboard.
- **AI flashcards:** Students can select a course and up to five uploaded notes to generate interactive question-and-answer revision cards through the authenticated Vercel serverless endpoint. Only active course notes are eligible; past questions are excluded.
- **AI quizzes:** Students can generate and take course-note-based quizzes. Quiz generation is separate from the temporarily paused note summarizer.
- **AI note summaries:** Summary generation is temporarily unavailable; saved summary history remains accessible.
- **Password recovery:** Students can request a password-reset email and set a new password through the recovery link.

### Administrator features
- **Restricted administrator sign-in:** The administrator login checks the account's role before allowing access to the admin dashboard.
- **Course creation:** Administrators can add a course code, title and description, and assign the course to one or more departments.
- **Resource uploads:** Administrators use separate pages to create courses, upload notes/past questions, and upload videos or add YouTube links.
- **Supported files:** Notes accept PDF, DOCX and PPTX. Past questions accept PDF, DOCX, PPTX, JPG, PNG and WEBP.
- **Upload validation:** Notes and past-question files are limited to 50 MB. Video uploads accept MP4, WEBM and MOV up to 5 GiB and use resumable multipart transfers.
- **Course management:** Administrators can edit course titles, activate or deactivate courses, and delete courses with their associated resource records and stored files.
- **Resource management:** The searchable Manage Courses & Resources page has separate tables for courses, notes, past questions, uploaded videos and YouTube videos. Administrators can edit, activate/deactivate, hide/show and delete the relevant records. Admin tables show file sizes for notes, past questions and uploaded videos.
- **Course-list refresh:** The upload form has a dedicated refresh control to reload the course dropdown without refreshing the whole page.
- **Student preview:** Administrators can open the student dashboard from the admin navigation menu to view the student-facing experience.
- **Department organization:** Course assignment is grouped by college, with expandable department/programme options and college-level selection.

### Video tutorials
The video library supports uploaded course videos and YouTube links as separate student-facing searchable pages. Uploaded videos are stored privately in Cloudflare R2 (with legacy Supabase Storage paths still supported); YouTube videos are embedded in the platform when the video owner permits external embedding. Administrators can hide/show YouTube entries and manage uploaded videos separately.

---

## 2. Application pages

| Page | Purpose |
|---|---|
| `index.html` | Student sign-in |
| `register.html` | Student account registration |
| `admin-login.html` | Restricted administrator sign-in |
| `student.html` | Student feature hub |
| `notes.html` | Course notes browser and downloads |
| `past-questions.html` | Past questions browser with test/exam filters |
| `quizzes.html` | AI quiz generation and practice |
| `flashcards.html` | AI flashcard generator and interactive study deck (Vercel deployment) |
| `videos.html` | Search and play uploaded course videos |
| `youtube-videos.html` | Search and play embedded YouTube tutorials |
| `admin.html` | Create courses |
| `admin-resources.html` | Upload notes and past questions |
| `admin-videos.html` | Upload videos and add YouTube links |
| `admin-manage.html` | Search and manage courses, notes, past questions, uploaded videos and YouTube videos |
| `reset-password.html` | Request a password-reset email |
| `update-password.html` | Set a new password from a valid recovery link |

---

## 3. Technology stack

- **Frontend:** HTML5, CSS3 and browser-native JavaScript ES modules.
- **Backend services:** [Supabase](https://supabase.com/).
- **Authentication:** Supabase Auth for registration, email confirmation, sessions and password recovery.
- **Database:** Supabase Postgres for user profiles, departments, courses, course-to-department assignments, resource metadata and course video metadata.
- **File storage:** Supabase Storage keeps private course documents and summary PDFs. Private Cloudflare R2 stores video files; Supabase Postgres retains video metadata and access rules.
- **Hosting:** Vercel and GitHub Pages.
- **Video storage API:** Authenticated Vercel serverless API signs multipart R2 uploads and short-lived playback URLs using server-side S3 credentials.
- **AI generation:** Authenticated Vercel serverless functions call Gemini, Groq and OpenRouter providers for the study tools. Provider credentials remain server-side. Note summarization is currently paused; flashcards and quizzes have separate generation flows.
- **Supabase JavaScript client:** Loaded from `https://esm.sh/@supabase/supabase-js@2`.

The project is a static frontend. It does not currently require a Node.js build step or a package manager to run.

---

## 4. Repository structure

```text
uni-verse/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages deployment workflow
├── assets/
│   ├── css/
│   │   └── styles.css          # Shared application styles and responsive layouts
│   └── js/
│       ├── supabase.js         # Supabase client, session/profile checks and shared helpers
│       ├── login.js            # Student and administrator sign-in
│       ├── register.js         # Student registration and department loading
│       ├── reset-password.js  # Password-reset email request
│       ├── update-password.js # Password recovery session and password update
│       ├── student.js          # Student feature hub and profile display
│       ├── resources.js        # Notes and past-question listing, filters and downloads
│       ├── placeholder.js      # Authentication for planned feature pages
│       ├── flashcards.js       # Course-note selection and interactive AI flashcards
│       ├── admin.js            # Course creation and resource uploads
│       └── admin-manage.js     # Course and resource administration
├── api/
│   └── flashcards.js            # Authenticated Vercel serverless flashcard API
├── package.json                # Serverless function dependencies
├── index.html                 # Student sign-in page
├── register.html              # Registration page
├── admin-login.html           # Administrator sign-in page
├── student.html               # Student feature hub
├── notes.html                  # Course notes browser
├── past-questions.html         # Past questions browser
├── quizzes.html                # Quizzes landing page
├── flashcards.html             # AI flashcard generator and study deck
├── videos.html                 # Video tutorials landing page
├── admin.html                 # Administrator content dashboard
├── admin-manage.html          # Course and resource management page
├── reset-password.html        # Password-reset request page
├── update-password.html       # New-password page
├── README.md
└── .nojekyll                  # Prevents GitHub Pages from applying Jekyll processing
```

---

## 5. How the application works

### Authentication and user profiles
Supabase Auth handles account credentials and sessions. The application reads the matching record from the `profiles` table to obtain the user's name, matriculation number, role and department.

The `role` field determines whether the account is a student or administrator. Administrator access is checked after authentication; simply opening an administrator URL does not grant administrator privileges.

### Departments and courses
Departments are stored in the `departments` table. Courses are stored in `courses`, while `course_departments` associates courses with the departments that offer them.

A student dashboard query filters active courses against the department saved on that student's profile. An administrator can assign a course to multiple departments when creating it.

### Learning resources
Resource metadata is stored in `course_resources`. The actual uploaded file is stored in the Supabase Storage bucket `course-resources`; the database record stores the file path and related details.

Resources are categorized as:
- **Notes** — general course learning materials.
- **Past questions** — test or examination materials, with optional academic-year and semester information.

Only resources marked active are shown to students. Administrators can hide a resource without deleting it, then publish it again later.

---

## 6. Local development

You can run the static frontend locally with Python's built-in HTTP server.

1. Clone the repository:

   ```bash
   git clone https://github.com/sheddykid/uni-verse.git
   cd uni-verse
   ```

2. Start a local server:

   ```bash
   python -m http.server 5500
   ```

3. Open:

   ```text
   http://localhost:5500
   ```

A local HTTP server is required because the application uses JavaScript ES modules. Opening the HTML files directly with a `file://` URL may prevent modules from loading.

The frontend's Supabase connection is currently defined in `assets/js/supabase.js`. If you are configuring a different Supabase project, update the project URL and publishable key there.

---

## 7. Supabase setup

UNI-VERSE currently connects to this Supabase project:

- **Project URL:** `https://xcybjuwearndoljqkzmy.supabase.co`
- **Client configuration:** `assets/js/supabase.js`

To configure Supabase for a deployment:

1. Ensure the database contains the application tables used by the frontend: `profiles`, `departments`, `courses`, `course_departments`, `course_resources` and `course_videos`.
2. Configure Supabase Authentication email confirmation and password-recovery settings.
3. Add the relevant production and local application URLs to the Supabase Auth URL configuration:
   - `https://uni-verse-sheddykid.vercel.app`
   - `https://sheddykid.github.io/uni-verse/`
   - `http://localhost:5500`
4. Create and configure the `course-resources` Storage bucket and its access policies.
5. Apply Row Level Security (RLS) policies to the database tables and appropriate access policies to Storage.
6. Ensure each user has a corresponding `profiles` record and that administrator accounts have the correct role.

The exact redirect URLs should match the deployed application and the routes configured in Supabase Auth. If you use another domain, add that domain to the allowed redirect URLs as well.

---

## 8. Deployment

### Vercel
The project is connected to Vercel. Pushes to the connected GitHub branch can trigger a deployment according to the Vercel project settings.

Production URL: https://uni-verse-sheddykid.vercel.app

### GitHub Pages
The repository also contains `.github/workflows/deploy.yml`. The workflow deploys the repository contents to GitHub Pages when changes are pushed to `main`, or when the workflow is run manually.

GitHub Pages URL: https://sheddykid.github.io/uni-verse/

For GitHub Pages deployment, ensure GitHub Pages is configured to use **GitHub Actions** as its build and deployment source.

---

## 9. Security notes

- The browser uses a Supabase **publishable key**. This key is intended for client-side use; it is not a substitute for database and Storage security policies.
- **Never place a Supabase service-role key, SMTP password, email app password or other private credential in frontend code or commit it to this repository.**
- Use Row Level Security to enforce who can read or modify profiles, departments, courses, assignments and resource records.
- Use Storage policies to restrict uploads, downloads and deletion to the appropriate users.
- Frontend role checks are for application navigation and user experience. They are not a security boundary; authorization must also be enforced by Supabase policies.
- Keep Supabase Auth Site URL and redirect allowlists limited to the domains used by the application.

---

## 10. Current scope and limitations

- UNI-VERSE includes authentication, college/department-based course assignment, course administration, notes and past questions, uploaded and YouTube video tutorials, AI flashcards, quizzes and AI note summaries.
- AI flashcards require the Vercel deployment because GitHub Pages does not run the `/api/flashcards` serverless function. The Gemini API key is stored as a Vercel environment variable and is never exposed to the browser.
- Video tutorials support resumable Cloudflare R2 uploads, course-based access, search, playback and admin management. Quiz generation is implemented separately.
- The frontend validates supported file extensions and file size, but backend Storage policies must also enforce appropriate access and upload restrictions.
- Email delivery depends on the SMTP provider configured in Supabase Auth and the provider's sending limits.

---

## 11. Admin management reliability audit (2026-11-20)

A focused review of the admin course/resource management and deletion paths identified and corrected the following failure-handling defects:

- **Course deletion order:** Previously, stored files were deleted before the course row. If the database delete then failed, resource metadata could remain while its file was already gone. The workflow now deletes the course row first (the database cascades to its course-resource and course-department rows), then removes the associated files from the private Storage bucket. A failed database delete leaves files untouched. A failed Storage cleanup is reported as orphaned private files rather than a successful complete deletion.
- **Resource deletion order:** The workflow now deletes the resource metadata first and removes its Storage object only after the database confirms a row was deleted. A failed database delete no longer destroys the file referenced by that row.
- **Large course cleanup:** Course-file deletion is split into batches of at most 1,000 paths, matching the Supabase Storage API limit.
- **Course creation rollback:** If department assignment fails after course creation, the compensating course deletion is checked. A failed rollback is surfaced with the affected course ID instead of being silently ignored.
- **Upload rollback:** If resource metadata insertion fails after a successful upload, the Storage cleanup result is checked, including thrown network errors. If cleanup also fails, the admin receives the orphaned file path and cleanup error.
- **One-off orphan cleanup:** Removed the hard-coded list of historical file paths that ran automatically whenever an admin opened the management page. Cleanup of orphaned objects must be deliberate and verified; page visits should not trigger deletion of unrelated files.

### Implementation commits

- Admin deletion safety: [9571f225](https://github.com/sheddykid/uni-verse/commit/9571f225a8880e280d43425b89814551793cd189)
- Admin creation/upload rollback reporting: [bc1206cc](https://github.com/sheddykid/uni-verse/commit/bc1206cc3205f433e37cef112154bc94534eb4de)
- Follow-up deletion error handling: [c7ea745b](https://github.com/sheddykid/uni-verse/commit/c7ea745b1882ef866ec8c4e408172776e8106146)
- Thrown-error handling for creation/upload rollback: [7460840a](https://github.com/sheddykid/uni-verse/commit/7460840a3720d38e933a01919dcc658c02b379cb)
- GitHub Actions syntax checks: [10cf5776](https://github.com/sheddykid/uni-verse/commit/10cf5776f26bcca73da169e72f19f73af7de31d6)
- Clarified course deletion cascade warning: [7ada1317](https://github.com/sheddykid/uni-verse/commit/7ada131750b622de108b68b3ec36b316ea2d7aaf)
- README audit record: [849441d](https://github.com/sheddykid/uni-verse/commit/849441d63413ca9765821d0cf9eb4c2f53911b2c)

### Database behavior verified

The live schema confirms that deleting a course cascades to its course-department mappings, resource metadata, and other course-scoped records. The current read-only integrity check found 3 resource records and 5 course-department assignment rows. The four historical paths previously listed for one-off cleanup were not present in `storage.objects` at the time of this audit.

### Current deployment state (2026-11-20)

- Vercel automatically deployed the first deletion-safety commit `9571f225a8880e280d43425b89814551793cd189` as production deployment `dpl_7aya35bUP8fZ1aF34QttB2spSqMs` (READY).
- That deployed revision is intermediate: its admin management script still calls the historical `removeOrphanedUploads()` function after the function was removed. The lists render first, but the stale call raises a runtime error afterward.
- Follow-up commit `c7ea745b1882ef866ec8c4e408172776e8106146` removes the stale call and separates Storage cleanup errors from database deletion errors. Later rollback-handling and CI changes are also committed on `main`.
- The combined GitHub status for the later README revision reports the Vercel check as failed with a build-rate-limit link. The latest production deployment therefore does not yet contain the follow-up correction.
- Do not mark production as verified until Vercel deploys the latest `main` commit and the management page is checked.
- Latest main commit at this audit checkpoint: `eb9c4e63358edab3018f41d398050f7c1ce25969` (the commit may advance as this record is updated).
- A one-time follow-up is scheduled for **2026-11-21 at 10:45 (Africa/Lagos)** to recheck Vercel quota, deploy the latest `main` revision if allowed, and verify production routes. Destructive authenticated tests remain manual.

### Verification status

- [x] Reviewed the current admin upload, course creation, course deletion and resource deletion code.
- [x] Verified the relevant course/resource foreign-key delete rules in Supabase.
- [x] Verified the four historical orphan paths are no longer present in the Storage object metadata.
- [x] Updated failure ordering and rollback reporting in the admin scripts.
- [ ] Confirm the new GitHub Actions syntax-check step passes for both admin scripts.
- [ ] Deploy the committed changes to Vercel after the deployment quota becomes available.
- [ ] Test course deletion with resources, resource deletion, failed-delete behavior, course creation rollback, and upload rollback in an authenticated admin session.
- [ ] Confirm that no resource records point to missing Storage objects and no new orphaned objects are created by the tested workflows.

**Important:** Database-first deletion avoids leaving a live resource record pointing to a file that was already deleted. It cannot make Postgres and Storage one atomic transaction; if Storage cleanup fails after the database deletion, the remaining private file is an orphan and requires a separate cleanup. Do not report a deletion as fully complete until both stages succeed.

## 12. Navigation and resource management UI update (2026-11-20)

- The administrator **Manage resources** list now uses the student resource-browser card hierarchy: course label, resource title, optional description, file/type metadata, visibility status and grouped actions. Cards adapt to narrow screens.
- Student learning pages now use a hamburger-triggered slide-out navigation drawer instead of the previous bottom quick-navigation bar.
- The drawer displays the signed-in student's full name and matriculation number, and links to the learning hub and study pages.
- Administrator pages retain their own navigation controls; the student drawer is shared across student-facing pages.
- A movable Contact Admin control is available on student pages. It can be dragged, tucked against the screen edge, and restored with an arrow tab.

### Verification still required
- [ ] Run JavaScript syntax checks for the changed admin management script.
- [ ] Verify every student/admin route and navigation link on both hosting environments.
- [ ] Check resource cards and fixed navigation on mobile and desktop.
- [ ] Confirm the updated UI is deployed to Vercel and GitHub Pages.

## 13. Contributing and maintenance

When changing the application:

1. Keep shared authentication and Supabase helpers in `assets/js/supabase.js`.
2. Keep page-specific behavior in the matching JavaScript module.
3. Reuse the shared styles in `assets/css/styles.css`.
4. Test student and administrator flows separately.
5. Test registration, email confirmation, password recovery, course assignment, resource upload, download and deletion after changes that affect those features.
6. Never commit private credentials or service-role keys.

For bugs or feature requests, open an issue in the GitHub repository.

## 14. Student navigation and Contact Admin (2026-11-20)

- Replaced the student bottom navigation bar with a hamburger-triggered slide-out drawer across the student learning pages.
- The drawer reads the authenticated user's `profiles.full_name` and `profiles.matric_number` and provides links to the learning hub, notes, past questions, quizzes, flashcards, summaries and videos.
- Added a floating Contact Admin control. Students can drag it, tuck it against the screen edge, restore it with the edge arrow, and open a form containing an email address and complaint.
- The form invokes the authenticated Supabase Edge Function `contact-admin`. The function validates the Supabase access token, validates the submitted email/message, applies a per-user cooldown, and sends a plain-text email to **babularbossman@gmail.com** through Gmail SMTP. The student's supplied email is set as Reply-To.
- The function is deployed with JWT verification enabled. SMTP credentials are read only from Edge Function environment secrets; they are not stored in browser code or the repository.

### Required Gmail SMTP secrets

The email form will not send until these two secrets are added in **Supabase Dashboard → Edge Functions → Secrets** for the UNI-VERSE project:

| Secret | Value |
|---|---|
| `SMTP_USERNAME` | The Gmail address used as the SMTP sender (the same sender account configured for Auth SMTP may be reused) |
| `SMTP_PASSWORD` | A Gmail App Password for that sender account (not the normal Gmail login password) |

After saving the secrets, the Edge Function reads them without requiring another deployment. Do not put either value in frontend code, GitHub, or a chat message.

### Verification status

- [x] Student navigation drawer and profile details implemented on student-facing pages.
- [x] Draggable/tuckable Contact Admin control and complaint form implemented.
- [x] Authenticated `contact-admin` Edge Function deployed with JWT verification enabled.
- [x] User reports adding `SMTP_USERNAME` and `SMTP_PASSWORD` as Supabase Edge Function secrets.
- [ ] Send a test complaint from a signed-in student account and confirm receipt at the admin Gmail inbox.
- [x] Verify the latest Vercel production deployment is READY for commit `04af62f28c7df531f105fab7188e59ab3348f5fa`.
- [ ] Verify the GitHub Pages workflow after the latest commit.

## 15. Contact Admin shortcut refinement — production verified (2026-11-21)

The student Contact Admin shortcut has been refined and the user has confirmed that the deployed behavior works:

- The floating control is now a compact, icon-only envelope button rather than a large panel.
- On the first authenticated student page visit in a browser tab/session, the shortcut appears for approximately three seconds, then tucks itself to the screen edge.
- The introductory display is tracked per authenticated student for the current tab session, so navigating between student pages does not repeatedly show the floating control.
- The edge arrow remains available; students can tap it to restore the Contact Admin button. Students can also tuck it away again.
- The control can be dragged to a different screen position. Its position is saved locally so it can be retained across student pages.
- The student navigation remains a hamburger-triggered drawer showing the student's profile details; the old bottom navigation bar is not used.

### Verification status

- [x] Compact icon-only Contact Admin control implemented.
- [x] Three-second introductory display implemented.
- [x] Introductory display limited to once per student per tab session.
- [x] Tucked state and edge-arrow restore behavior persist while navigating between student pages.
- [x] Drag interaction and saved position confirmed by the user in the live application.
- [x] User confirmed the deployed feature is working.
- [x] Vercel production deployment reached READY for commit `04af62f28c7df531f105fab7188e59ab3348f5fa`.
- [x] User reports that `SMTP_USERNAME` and `SMTP_PASSWORD` have been added as Supabase Edge Function secrets.
- [ ] Send a test complaint from a signed-in student account and confirm receipt in the admin Gmail inbox. SMTP secret configuration alone does not prove email delivery.
- [ ] Verify the latest GitHub Pages workflow after the latest commit.

Implementation files: `assets/js/student-navigation.js`, `assets/css/styles.css`, and `supabase/functions/contact-admin/index.ts`.

## 16. Admin management reliability audit — deployment verification (2026-11-21)

### Source and production deployment

- GitHub `main` was checked directly. Its head at the verification checkpoint was [`11969a6d94cffc30c5780b1b51c07c6ff71e2625`](https://github.com/sheddykid/uni-verse/commit/11969a6d94cffc30c5780b1b51c07c6ff71e2625) — **Add quiz history page controller** (2026-11-21 09:46:39 UTC).
- Vercel production deployment [`dpl_DUmvhijcwQgzaP1XsaeVu78G1fqL`](https://vercel.com/sheddykid/uni-verse/DUmvhijcwQgzaP1XsaeVu78G1fqL) reached **READY** from that exact `main` commit. Production alias: [https://uni-verse-sheddykid.vercel.app](https://uni-verse-sheddykid.vercel.app).
- The Vercel build completed and deployed successfully; no rate-limit error was reported for this latest deployment. The connected Vercel API did not expose a numeric remaining deployment-quota counter, so quota availability is confirmed operationally by the successful build, not by a remaining-count figure.
- Vercel emitted a non-blocking Node-version warning: `package.json` selects Node `22.x`, overriding the project's `26.x` setting. The build still completed successfully.
- Several intermediate commits were canceled while newer commits were arriving; the latest `main` commit above is the one that reached READY.

### GitHub Actions

- Workflow: **Deploy UNI-VERSE to GitHub Pages**, run [`44891177841`](https://github.com/sheddykid/uni-verse/actions/runs/44891177841) (run 272), triggered by push to `main`.
- Overall result: **completed / success**.
- The `deploy` job and the **Check admin script syntax** step both succeeded. That step ran `node --check` on `assets/js/admin.js` and `assets/js/admin-manage.js` as well as the other listed application scripts and API files.

### Admin route/source correspondence

The four source files are present at the deployed commit. The two HTML pages reference their matching module scripts:

| File at commit `11969a6d94cf` | Git blob SHA |
|---|---|
| `admin.html` | `f799e43bb50eeacef781687f9b622e891c38ce07` |
| `admin-manage.html` | `865ed846e5574c7813eaa0835ea7f690f2fcfc12` |
| `assets/js/admin.js` | `ce4065b44662cb00db23b86f96994ea706e85bd2` |
| `assets/js/admin-manage.js` | `9cf84854b3a44c220547de0cd87cd1b085ff1566` |

The latest `admin-manage.js` no longer contains the stale `removeOrphanedUploads()` call. Its course deletion flow deletes the database row first, handles Storage cleanup separately, and reports cleanup failures without claiming the course still exists.

**HTTP/browser verification remains incomplete.** The available external fetch path could not reach the Vercel host, and no authenticated admin browser session was available. Therefore, do not mark the following production HTTP responses as confirmed: [`/admin.html`](https://uni-verse-sheddykid.vercel.app/admin.html), [`/admin-manage.html`](https://uni-verse-sheddykid.vercel.app/admin-manage.html), [`/assets/js/admin.js`](https://uni-verse-sheddykid.vercel.app/assets/js/admin.js), and [`/assets/js/admin-manage.js`](https://uni-verse-sheddykid.vercel.app/assets/js/admin-manage.js). The Vercel deployment metadata and build log confirm the exact source commit, but they do not substitute for direct HTTP status checks.

### Remaining manual verification

- [ ] Open all four production URLs above and confirm each returns HTTP 200; confirm the HTML pages load their corresponding JavaScript modules without 404s.
- [ ] Sign in with an admin account. Open `admin.html`; confirm the admin identity, active department checkboxes, and course/resource form load without console or network errors.
- [ ] Open `admin-manage.html`; confirm course rows, department assignments, resource cards, and action controls load. Confirm there is no runtime reference to the removed cleanup helper.
- [ ] Sign in with a student account and visit both admin URLs directly; confirm the role guard redirects to the student area.
- [ ] Exercise non-destructive admin actions on test records: edit a course title, activate/deactivate a test course, and refresh the lists.
- [ ] In a disposable staging/test dataset only, test resource deletion and course deletion with linked resources. Verify database metadata is removed before Storage cleanup, cascaded rows are handled, and the expected Storage objects are removed.
- [ ] In that same isolated test environment, simulate Storage/network failures during deletion and failures during course-creation/upload rollback. Confirm the UI reports partial failures accurately and check for orphaned Storage objects or metadata pointing to missing files.

No destructive database or Storage tests were run during this audit checkpoint. Do not run the deletion/failure-injection cases against production records.

## 17. Video tutorials and Cloudflare R2

- Video metadata remains in the Supabase `course_videos` table. New video objects are stored in the private Cloudflare R2 bucket `uni-verse-videos`.
- Admin uploads use multipart transfers with 32 MiB parts, three concurrent workers, retry handling, upload progress and browser-local resume metadata. The per-video upload limit is 5 GiB.
- The Vercel API authenticates each request with the user's Supabase access token, verifies the administrator role for uploads/deletion, and uses R2 credentials only on the server.
- Students receive a 10-minute signed playback URL only after the API confirms the video row through the caller's Supabase RLS permissions. The R2 bucket stays private.
- Existing videos still stored in the old private Supabase `course-videos` bucket remain playable; admin deletion and course deletion handle both legacy Supabase paths and new R2 paths.
- Admins can edit metadata, hide/publish videos and delete videos. Course deletion removes linked video objects only after the database confirms the course deletion.

### Required Vercel environment variables

Set these for Production, Preview and Development. Values must be the credentials/endpoint from the R2 bucket's scoped S3 API token; do not put them in frontend code or GitHub.

| Variable | Purpose |
|---|---|
| `R2_ACCESS_KEY_ID` | R2 S3 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret access key |
| `R2_ENDPOINT` | The bucket's jurisdiction-specific S3 endpoint |
| `R2_BUCKET_NAME` | `uni-verse-videos` |

The R2 bucket CORS policy must allow the production Vercel origin to use `PUT`, `GET` and `HEAD`, allow the upload headers, and expose `ETag`. Keep public bucket access disabled. The AWS SDK connects with region `auto`.

---

## 18. Video playback CSP fix — production verified (2026-11-22)

The user confirmed that course video playback works on the production site after correcting the browser's Content Security Policy.

### Root cause

- The original video object in the private Cloudflare R2 bucket was intact. Integrity checks confirmed its file size, MP4 container structure, H.264 video track and AAC audio track.
- The signed playback URL and R2 byte-range requests returned valid responses.
- The browser rejected the source with media error 4 because the effective Content Security Policy did not permit the R2 origin in `media-src`. The browser diagnostic identified an enforced `media-src` violation and a media load rejected by the URL safety check.

### Resolution

- Updated the Vercel CSP in `vercel.json` to allow both the R2 wildcard and the bucket's exact R2 hostname in `media-src` and `connect-src`.
- Added a route-specific `Cache-Control: no-store, max-age=0, must-revalidate` header for `/videos.html` to prevent stale video-page policy responses.
- Kept the R2 bucket private and retained the existing short-lived signed playback URL flow.
- No video re-upload, re-encoding, or database schema change was required.

### Production verification

- [x] Original R2 video integrity verified.
- [x] Signed URL and byte-range response verified.
- [x] Live production response returned HTTP 200.
- [x] Live production CSP explicitly permits the R2 origin in `media-src` and `connect-src`.
- [x] Video page response includes the no-store cache policy.
- [x] User confirmed that playback works in the production application.

### Relevant commits

- CSP diagnostics: [073a44b](https://github.com/sheddykid/uni-verse/commit/073a44b0308d6de1608a83f5cf2a0538749c5ea4)
- Prevent stale video-page CSP caching: [016cb48](https://github.com/sheddykid/uni-verse/commit/016cb487e5a8ef1a5da64dad688756fb324e6245)

## 19. Admin/student interface update and verification boundary (2026-11-22)

### Student interface

- Student navigation uses a hamburger drawer. Video Tutorials expands into separate Uploaded Videos and YouTube Videos destinations.
- Uploaded videos and YouTube tutorials have separate searchable pages. YouTube links play through an embedded player when the video owner allows embedding.
- Student-facing video pages do not display uploaded-video file sizes. Course-note file sizes remain visible; past-question and video sizes are not shown to students.
- Course loading and student-page initialization fixes were committed after a reported issue where removal of the old top-bar Sign Out control left scripts attempting to attach listeners to a missing element. Affected workflows include course selection in AI Note Summarizer, quizzes and flashcards, notes, past questions, and history views.

### Admin interface

- Admin tasks are separated into course creation, notes/past-question upload, video/YouTube upload, and Manage Courses & Resources pages.
- Admin navigation is a hamburger menu. The UNI-VERSE brand is centered and no longer includes an `/ Admin` suffix. Student View is available from the admin menu.
- College groups expand to show their department/programme options. College selection selects the child options; department totals and redundant picker labels were removed.
- Manage Resources uses shortened department labels and Active/Inactive status wording. YouTube entries have Hide/Show controls.
- Admin resource tables show file sizes for notes, past questions and uploaded videos. This is intentionally different from the student-facing video pages.

### YouTube fullscreen

The embedded iframe requests fullscreen permission and the player container has viewport-sized fullscreen CSS. A user-reported mobile screenshot showed the player in a portrait viewport; device-level fullscreen behavior still needs testing on the target phone/browser. Videos are 16:9, so black space may remain in portrait orientation.

### Source and deployment status

- Latest related UI commits include [admin branding cleanup](https://github.com/sheddykid/uni-verse/commit/5bc448928abce71c84df2c31ade2eab77a3cdf58) and [admin file-size restoration](https://github.com/sheddykid/uni-verse/commit/b7c93f847b8826cc85529955403f965193a50420). The video, fullscreen, navigation and student loading fixes are also in the current `main` history.
- Vercel deployment API currently returns HTTP 402 because the free-tier daily deployment API limit (more than 100 calls in 24 hours) has been exceeded. Vercel reported a 24-hour retry window.
- GitHub source updates are committed, but this latest UI revision is not confirmed deployed to the Vercel production alias. Do not describe the latest fixes as production-verified until deployment reaches READY and the affected student/admin flows are retested.

### Post-deployment regression checklist

- [ ] Confirm uploaded-video and YouTube-video lists load and search correctly for students.
- [ ] Confirm YouTube embedding works for embeddable videos and the fullscreen control behaves correctly on Android portrait and landscape.
- [ ] Confirm students do not see video file sizes, while note file sizes remain visible.
- [ ] Confirm admin tables show file sizes for notes, past questions and uploaded videos.
- [ ] Confirm course choices load in AI Note Summarizer, Quizzes and Flashcards.
- [ ] Confirm notes, past questions, quiz history and summary history load for an authenticated student.
- [ ] Confirm YouTube Hide/Show works from Manage Resources and hidden videos are not shown to students.
- [ ] Confirm admin branding, department abbreviations, college expand/collapse and Active/Inactive labels on mobile and desktop.
- [ ] Deploy the latest `main` revision to Vercel and record the exact READY deployment SHA.
