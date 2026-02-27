# Supabase setup

## Quick setup checklist (new environment)

1. **Run migrations (once per Supabase project)**  
   In Supabase Dashboard → **SQL Editor**:
   - Run `migrations/20250223000000_create_profiles.sql`  
   - Run `migrations/20250226000000_profiles_first_last_name.sql`  
   - Run `migrations/20250225000000_fix_profiles_email_and_trigger.sql`  
   - Run `migrations/20250227000000_profiles_insert_policy.sql`  
   - (Optional for Canvas) Run `migrations/20250228000000_profiles_canvas_api_key.sql`

2. **Configure Forgot Password redirect URL**  
   Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**:
   - Add `http://localhost:3000/profile/reset-password` for local dev.
   - Add your production URL, e.g. `https://your-domain.com/profile/reset-password`.

3. **(Optional) Configure Test Login (dev-only)**  
   - Create a test user in **Authentication → Users** with “Auto Confirm User” enabled.  
   - In `frontend/.env.local` add:
     - `NEXT_PUBLIC_TEST_USER_EMAIL=...`
     - `NEXT_PUBLIC_TEST_USER_PASSWORD=...`  
   - **Do not set these in production**; the app hides the Test login button when `NODE_ENV === "production"`.

After these steps, auth + profile should work end-to-end in that environment.

---

## 1. Create the `profiles` table and backfill users

The app uses a **separate** table `public.profiles` (not the built-in `auth.users`). It has columns: `id`, `email`, `first_name`, `last_name`, `display_name`, `canvas_api_key`, `created_at`, `updated_at`.

1. Open your project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor** → **New query**.
3. Copy the **entire** contents of `migrations/20250223000000_create_profiles.sql` and paste into the editor.
4. Click **Run**.

This will:
- Create the `profiles` table under the **public** schema (in **Table Editor** you’ll see it as `profiles`, not under “auth”).
- Add a trigger so new sign-ups get a profile row automatically.
- **Backfill** existing users from `auth.users` into `profiles`.

To confirm: **Table Editor** → open the **public** schema → you should see **profiles** with columns: id, email, display_name, created_at, updated_at.

**Add first and last name (sign-up):** Run `migrations/20250226000000_profiles_first_last_name.sql` in the SQL Editor. This adds `first_name` and `last_name` to `profiles`, updates the trigger to set them from sign-up metadata, and backfills from existing auth metadata where present.

**If profile email was null** (e.g. you created the table before this fix): run the second migration `migrations/20250225000000_fix_profiles_email_and_trigger.sql` in the SQL Editor. It fixes the trigger and backfills email from `auth.users`.

**If "Failed to update name" when saving profile:** Add the insert RLS policy so upsert can create a missing profile row. Run `migrations/20250227000000_profiles_insert_policy.sql` in the SQL Editor.

**Dates “one day off” in the dashboard?** `created_at` and `updated_at` are stored in **UTC** (e.g. `2026-02-25 00:20:29+00`). In US timezones that can be the previous calendar day locally; the value is correct.

## 2. Test login (optional)

To use the **Test login** button on the Profile page:

1. Create a test user in Supabase: **Authentication** → **Users** → **Add user**.
   - Use the same email/password you will set in `.env.local` below.
   - **Important:** Turn on **“Auto Confirm User”** so the user can sign in without confirming email. Otherwise you’ll get “Invalid credentials”.
2. In the project root or frontend, add to `.env.local`:

   ```env
   NEXT_PUBLIC_TEST_USER_EMAIL=test@example.com
   NEXT_PUBLIC_TEST_USER_PASSWORD=your-test-password
   ```

3. Restart the dev server. The Profile page will show a **Test login** button; clicking it signs in with those credentials.

## 3. Forgot password (redirect URL and email)

For **Forgot password** to work:

1. **Redirect URL (required)**  
   In Supabase Dashboard → **Authentication** → **URL Configuration** → **Redirect URLs**, add:
   - Local: `http://localhost:3000/profile/reset-password`
   - Production: `https://your-domain.com/profile/reset-password`  
   If this URL is not in the list, Supabase may not send the reset email, or the link in the email will not open your app.

2. **Email delivery**  
   Supabase sends the reset email using its built-in mailer. If you don’t receive it:
   - Check **spam/junk**.
   - Confirm the address is a user in **Authentication → Users** (reset is only sent for existing users).
   - Optional: **Project Settings → Auth** — review “SMTP” if you use custom SMTP; otherwise the default Supabase mailer is used.
