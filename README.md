# UNI-VERSE

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
- **Feature hub:** The student dashboard links to dedicated pages for notes, past questions, quizzes, flashcards and video tutorials.
- **Learning resources:** Notes and past questions have separate pages, with course filtering and test/exam filtering for past questions.
- **Past-question details:** Resources can identify test or examination questions and optionally include the academic year and semester.
- **Downloads:** Students can download course files. Image-based past questions can also be previewed in the dashboard.
- **AI flashcards:** Students can select a course and up to five uploaded notes to generate interactive question-and-answer revision cards through the Gemini API from the authenticated Vercel serverless endpoint. Only active course notes are eligible; past questions are excluded.
- **Password recovery:** Students can request a password-reset email and set a new password through the recovery link.

### Administrator features
- **Restricted administrator sign-in:** The administrator login checks the account's role before allowing access to the admin dashboard.
- **Course creation:** Administrators can add a course code, title and description, and assign the course to one or more departments.
- **Resource uploads:** Administrators can upload notes and past questions to a selected course.
- **Supported files:** Notes accept PDF, DOCX and PPTX. Past questions accept PDF, DOCX, PPTX, JPG, PNG and WEBP.
- **Upload validation:** The interface checks file type and enforces a 50 MB maximum file size.
- **Course management:** Administrators can edit course titles, activate or deactivate courses, and delete courses with their associated resource records and stored files.
- **Resource management:** Administrators can edit resource titles and descriptions, publish or hide resources, and delete resources.
- **Course-list refresh:** The upload form has a dedicated refresh control to reload the course dropdown without refreshing the whole page.
- **Student preview:** Administrators can open the student dashboard to view the student-facing experience.

### Planned learning tools
Dedicated pages now exist for quizzes and video tutorials, but their learning functionality is not implemented yet. These pages are clearly marked as coming soon.

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
| `quizzes.html` | Dedicated quizzes page (planned functionality) |
| `flashcards.html` | AI flashcard generator and interactive study deck (Vercel deployment) |
| `videos.html` | Dedicated video tutorials page (planned functionality) |
| `admin.html` | Create courses and upload resources |
| `admin-manage.html` | Manage existing courses and uploaded resources |
| `reset-password.html` | Request a password-reset email |
| `update-password.html` | Set a new password from a valid recovery link |

---

## 3. Technology stack

- **Frontend:** HTML5, CSS3 and browser-native JavaScript ES modules.
- **Backend services:** [Supabase](https://supabase.com/).
- **Authentication:** Supabase Auth for registration, email confirmation, sessions and password recovery.
- **Database:** Supabase Postgres for user profiles, departments, courses, course-to-department assignments and resource metadata.
- **File storage:** Supabase Storage bucket named `course-resources`.
- **Hosting:** Vercel and GitHub Pages.
- **AI generation:** Google Gemini API called from the authenticated Vercel serverless function; document extraction supports PDF, DOCX and PPTX course notes.
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

1. Ensure the database contains the application tables used by the frontend: `profiles`, `departments`, `courses`, `course_departments` and `course_resources`.
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

- UNI-VERSE includes authentication, department-based course access, course administration, downloadable learning resources and AI flashcard generation.
- AI flashcards require the Vercel deployment because GitHub Pages does not run the `/api/flashcards` serverless function. The Gemini API key is stored as a Vercel environment variable and is never exposed to the browser.
- Video tutorials and quizzes have dedicated landing pages, but their actual content and quiz-generation features remain planned additions.
- The frontend validates supported file extensions and file size, but backend Storage policies must also enforce appropriate access and upload restrictions.
- Email delivery depends on the SMTP provider configured in Supabase Auth and the provider's sending limits.

---

## 11. Admin management reliability audit (2026-11-20)

A focused review of the admin course/resource management and deletion paths identified and corrected the following failure-handling defects:

- **Course deletion order:** Previously, stored files were deleted before the course row. If the database delete then failed, resource metadata could remain while its file was already gone. The workflow now deletes the course row first (the database cascades to its course-resource and course-department rows), then removes the associated files from the private Storage bucket. A failed database delete leaves files untouched. A failed Storage cleanup is reported as orphaned private files rather than a successful complete deletion.
- **Resource deletion order:** The workflow now deletes the resource metadata first and removes its Storage object only after the database confirms a row was deleted. A failed database delete no longer destroys the file referenced by that row.
- **Large course cleanup:** Course-file deletion is split into batches of at most 1,000 paths, matching the Supabase Storage API limit.
- **Course creation rollback:** If department assignment fails after course creation, the compensating course deletion is checked. A failed rollback is surfaced with the affected course ID instead of being silently ignored.
- **Upload rollback:** If resource metadata insertion fails after a successful upload, the Storage cleanup result is checked. If cleanup also fails, the admin receives the orphaned file path and cleanup error.
- **One-off orphan cleanup:** Removed the hard-coded list of historical file paths that ran automatically whenever an admin opened the management page. Cleanup of orphaned objects must be deliberate and verified; page visits should not trigger deletion of unrelated files.

### Database behavior verified

The live schema confirms that deleting a course cascades to its `course_resources` and `course_departments` rows. The current read-only integrity check found 3 resource records and 5 course-department assignment rows. The four historical paths previously listed for one-off cleanup were not present in `storage.objects` at the time of this audit.

### Verification status

- [x] Reviewed the current admin upload, course creation, course deletion and resource deletion code.
- [x] Verified the relevant course/resource foreign-key delete rules in Supabase.
- [x] Verified the four historical orphan paths are no longer present in the Storage object metadata.
- [x] Updated failure ordering and rollback reporting in the admin scripts.
- [ ] Run JavaScript syntax/workflow checks against the committed revision.
- [ ] Deploy the committed changes to Vercel after the deployment quota becomes available.
- [ ] Test course deletion with resources, resource deletion, failed-delete behavior, course creation rollback, and upload rollback in an authenticated admin session.
- [ ] Confirm that no resource records point to missing Storage objects and no new orphaned objects are created by the tested workflows.

**Important:** Database-first deletion avoids leaving a live resource record pointing to a file that was already deleted. It cannot make Postgres and Storage one atomic transaction; if Storage cleanup fails after the database deletion, the remaining private file is an orphan and requires a separate cleanup. Do not report a deletion as fully complete until both stages succeed.

## 12. Contributing and maintenance

When changing the application:

1. Keep shared authentication and Supabase helpers in `assets/js/supabase.js`.
2. Keep page-specific behavior in the matching JavaScript module.
3. Reuse the shared styles in `assets/css/styles.css`.
4. Test student and administrator flows separately.
5. Test registration, email confirmation, password recovery, course assignment, resource upload, download and deletion after changes that affect those features.
6. Never commit private credentials or service-role keys.

For bugs or feature requests, open an issue in the GitHub repository.
