# UNI-VERSE

Centralized learning platform for Covenant University students.

## Increment 1
- Student registration and sign-in with Supabase Auth
- Role-aware student and administrator access
- Student dashboard with active departments and courses
- Administrator dashboard for course management

## Deployment
1. Push this repository to GitHub.
2. In GitHub, open **Settings → Pages** and set the build source to **GitHub Actions**.
3. Confirm the Supabase project URL, publishable key, Site URL, and redirect URLs in the project configuration.

The frontend uses the Supabase publishable key. Never put a Supabase service-role key in browser code.

## Supabase configuration
- Project URL: https://xcybjuwearndoljqkzmy.supabase.co
- Site URL: https://sheddykid.github.io/uni-verse/
- Redirect URL: https://sheddykid.github.io/uni-verse/**
- Local redirect URL: http://localhost:5500/**

Email confirmation should remain enabled. Database row-level security policies are the security boundary; frontend role checks are only for navigation.
