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
- **Learning resources:** Course cards separate uploaded materials into notes and past questions.
- **Past-question details:** Resources can identify test or examination questions and optionally include the academic year and semester.
- **Downloads:** Students can download course files. Image-based past questions can also be previewed in the dashboard.
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
The student dashboard currently identifies video tutorials and an AI study assistant as future additions. These should be treated as planned features, not as currently implemented functionality.

---

## 2. Application pages

| Page | Purpose |
|---|---|
| `index.html` | Student sign-in |
| `register.html` | Student account registration |
| `admin-login.html` | Restricted administrator sign-in |
| `student.html` | Student learning dashboard |
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
│       ├── student.js          # Student dashboard, resource listing and downloads
│       ├── admin.js            # Course creation and resource uploads
│       └── admin-manage.js     # Course and resource administration
├── index.html                 # Student sign-in page
├── register.html              # Registration page
├── admin-login.html           # Administrator sign-in page
├── student.html               # Student dashboard
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

- UNI-VERSE currently focuses on authentication, department-based course access, course administration and downloadable learning resources.
- Video tutorials and the AI study assistant are planned additions and are not yet active features.
- The frontend validates supported file extensions and file size, but backend Storage policies must also enforce appropriate access and upload restrictions.
- Email delivery depends on the SMTP provider configured in Supabase Auth and the provider's sending limits.

---

## 11. Contributing and maintenance

When changing the application:

1. Keep shared authentication and Supabase helpers in `assets/js/supabase.js`.
2. Keep page-specific behavior in the matching JavaScript module.
3. Reuse the shared styles in `assets/css/styles.css`.
4. Test student and administrator flows separately.
5. Test registration, email confirmation, password recovery, course assignment, resource upload, download and deletion after changes that affect those features.
6. Never commit private credentials or service-role keys.

For bugs or feature requests, open an issue in the GitHub repository.
