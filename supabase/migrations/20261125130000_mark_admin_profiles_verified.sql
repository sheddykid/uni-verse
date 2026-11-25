update public.profiles
set is_verified = true,
    verified_at = coalesce(verified_at, now()),
    verified_by = null,
    updated_at = now()
where role = 'admin';
