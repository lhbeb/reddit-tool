# Reddit Assignment Desk

A Next.js app for assigning Reddit work to an 8-person team. It separates:

- Reddit title
- Reddit post body
- Subreddit link
- Post assignee
- Comment text
- Comment assignee
- Status for both posts and comments

The current MVP stores data in the browser with `localStorage`, so you can use it right away. The data shape is ready for Supabase when you want team-wide shared data.

## Local Login

Choose a team member from the login dropdown and use the password for that profile:

- Mehdi Admin: `Mehbde!!2`
- Every other team member: `Localserver!!2`

This is intentionally simple for local testing. Use Supabase Auth or another real auth provider before relying on it for a public production app.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Vercel Deploy

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Framework preset: `Next.js`.
4. Build command: `npm run build`.
5. Output directory: leave default.

## Supabase Upgrade Path

When you are ready for shared online data:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Add environment variables in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

4. Install the client:

```bash
npm install @supabase/supabase-js
```

5. Replace the `localStorage` reads and writes in `src/app/page.tsx` with Supabase queries.

## DB Health Check

After adding Supabase env vars, open:

```bash
http://localhost:3000/api/db-health
```

The endpoint returns JSON and prints a `[db-health]` line in the Next.js server logs showing whether the required tables and storage buckets exist.

## Useful Scripts

```bash
npm run dev
npm run build
npm run lint
```
