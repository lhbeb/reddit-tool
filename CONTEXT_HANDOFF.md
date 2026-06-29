# Reddit Assignment Desk Handoff

Last updated: 2026-06-29 after notification log and wording polish.

## Current Goal

Build a minimal Reddit assignment/maintenance desk for a team of 8:

- Admin: Mehdi Admin.
- Members: Jebbar, Walid, Janah, Yassine, Amine, Abdo, Othman.
- Password: `Localserver!!2`.
- Only Mehdi Admin can assign/create/admin-manage tasks.
- Members see their own pending/done work, notifications, and proof actions.
- App is Next.js 16.2.9, deployed target Vercel, Supabase DB.

## Important Project Instructions

- `AGENTS.md` says this is not normal Next.js; read relevant docs under `node_modules/next/dist/docs/` before code changes.
- For frontend/UI edits, use the `frontend-design` skill.
- Use `apply_patch` for manual file edits.
- Do not hard-delete user work.
- Keep UI minimal, obvious, no huge headings, no letter spacing.
- Use `public/reddit-1.svg` logo.

## Current Repo State

Key files:

- `src/app/page.tsx`: still owns auth, data loading, derived state, and admin/member route branching.
- `src/components/reddit/task-components.tsx`: extracted presentational task/card components from the former bottom half of `page.tsx`.
- `src/lib/types.ts`: shared types extracted in Chunk 2.
- `src/lib/helpers.ts`: shared labels/helpers extracted in Chunk 2.
- `src/app/globals.css`: shared CSS/tokens.
- `src/app/api/db-health/route.ts`: server DB health check.
- `supabase/schema.sql`: SQL the user must run in Supabase.
- `REDDIT_MAINTENANCE_PLAN.md`: active roadmap.
- `PLAN.md`: older plan file from earlier work; has unrelated previous diff.
- `CONTEXT_HANDOFF.md`: this file.

Working tree is dirty because the roadmap repair, app-side chunk work, and handoff updates are not committed.

## Latest UI Refinement

Members now see task work as a vertical responsive card grid in both `My Tasks` and `All Team Tasks`.

- Each task is its own card.
- Cards use normal page scroll, so members swipe up/down on mobile.
- The task sections are no longer boxed around the heading; cards have more breathing room across the page width.
- Post cards use the orange Reddit accent.
- Comment cards use yellow so the two task types are easy to separate at a glance.
- The navbar notification button is now a dropdown team log that lists assignments, shared links, and closed work for everyone.
- User-facing `Queued` text is intentionally shown as `mazal`.
- User-facing published/link-ready text is intentionally shown as `tla7`.
- Internal DB/status values still use `queued` and `published_url`; do not rename those.

## Chunk 8 Architecture Cleanup

Status: In progress.

Completed in the first pass:

- Extracted `PostCard`, `TopNav`, `MetricCard`, `TaskSection`, `TeamTimelineSection`, `CommentComposer`, `ThreadedComment`, and shared task UI primitives into `src/components/reddit/task-components.tsx`.
- Kept behavior unchanged: `page.tsx` still passes the same props/callbacks into the extracted components.
- Reduced `src/app/page.tsx` from the near-4k-line monolith into a smaller top-level client controller.

Completed in the second pass:

- Moved Supabase error helpers into `src/lib/db/errors.ts`.
- Moved DB row mappers into `src/lib/db/mappers.ts`.
- Moved read-side post loading and select-plan fallback logic into `src/lib/db/posts.ts`.
- Moved team loading into `src/lib/db/team.ts`.
- Fixed the React console warning from `MetricCard` by replacing mixed `border`/`borderTop` inline styles with per-side border properties.
- Added narrow ESLint ignores for untracked generated root helper scripts (`add_*.js`, `fix_*.js`, `increase_avatar.js`, `remove_dupe.js`) so app linting is not blocked by one-off migration scripts.

Still remaining:

- Split admin and member dashboard shells out of `page.tsx`.
- Move write-side Supabase mutations out of `page.tsx`.
- Keep reducing `page.tsx` until it mostly handles auth, loading, routing, and composition.

## Completed Roadmap Chunks

### Chunk 1: Lifecycle Schema And Status Foundation

Status: Complete.

Implemented:

- Expanded statuses: `queued`, `working`, `done`, `rejected`, `removed`, `cancelled`.
- Added lifecycle SQL in `supabase/schema.sql`:
  - post columns: `soft_deleted`, `deleted_at`, `deleted_by`, `rejection_reason`, `assigned_at`.
  - comment columns: `parent_id`, `is_ai_draft`, `posted_url`, `assigned_at`.
  - `post_history` table, indexes, triggers, RLS policies.
  - enriched `reddit_assignment_health()` RPC.
- Extended `/api/db-health`.
- App status UI no longer breaks on new statuses.

### Chunk 2: Type And Helper Extraction

Status: Complete.

Implemented:

- Added `src/lib/types.ts`.
- Added `src/lib/helpers.ts`.
- `page.tsx` imports shared types/helpers.
- Replaced short dates with `timeAgo`.

### Chunk 3: Clean Status UI And Admin Controls

Status: Complete.

Implemented:

- Clean dot status pills, no emoji.
- Status selectors include all six statuses.
- Collapsed post cards simplified with compact `Post -> Comments` route.
- Root comment composer hidden until Admin clicks `+ Add comment`.
- Empty composer submit disabled.
- Button letter spacing removed.

### Chunk 4: Soft Delete And History Logging In App

Status: Complete.

Implemented:

- `Delete` admin action became `Cancel task`.
- Cancel is a soft delete update:
  - `status: cancelled`
  - `soft_deleted: true`
  - `deleted_at`
  - `deleted_by`
  - `rejection_reason`
- Active queues and member pending notifications ignore soft-deleted posts.
- All Statuses can still show closed/cancelled work.
- Reassignments set `assigned_at`.
- Create post/comment sends `created_by_id` when DB supports it.
- Load plans try lifecycle columns first, then fall back to old schemas.
- Added `reddit_posts_soft_deleted_idx` to schema.

## Current DB Reality

The live Supabase project has NOT had the lifecycle SQL run yet.

`GET /api/db-health` currently returns `503` with missing:

- `rpc:reddit_assignment_health_outdated`
- `post_history`
- `reddit_posts.soft_deleted`
- `reddit_posts.deleted_at`
- `reddit_posts.deleted_by`
- `reddit_posts.rejection_reason`
- `reddit_posts.assigned_at`
- `reddit_comments.parent_id`
- `reddit_comments.is_ai_draft`
- `reddit_comments.posted_url`
- `reddit_comments.assigned_at`

The app has fallbacks so it can still load on the old DB, but Chunk 4 persistence/history features need `supabase/schema.sql` run in Supabase to fully work.

## Chunk 5: Member Context And AI Drafts

Status: Complete.

Roadmap text:

- Add `is_ai_draft` to admin comment creation.
- Show member badge and copy-comment action for AI drafts.
- Add breadcrumbs for comment tasks: subreddit, post title, and comment context.
- Add member buttons for rejected/removed reports.

Implemented:

- Added `CommentDraft` with `body`, `assigneeId`, and `isAiDraft`.
- Admin root and reply comment composers now have an `AI draft` checkbox.
- Comment creation sends `is_ai_draft` and falls back cleanly if the old DB is missing the column.
- Comment tasks now carry `isAiDraft`, `postedUrl`, `parentCommentId`, and `parentCommentBody`.
- Threaded admin comments show an `AI draft` badge.
- Member cards show subreddit/title breadcrumbs and reply context when a comment is a reply.
- Member comment actions include `Copy comment` when the Reddit post link is ready, and AI drafts can be copied even while waiting for the post link.
- Member open tasks now show `Rejected` and `Removed` report buttons.
- Comment composer collapses to one column on small screens.

## Chunk 6: Member Tabs And Shared Team View

Status: Complete.

Implemented:

- Members now have `My Tasks` and `All Team Tasks` tabs.
- `My Tasks` keeps the personal pending-first queue and collapsible finished work.
- `All Team Tasks` is read-only and filterable by team member.
- The shared team view keeps open work first and visually quiets done/rejected/removed/cancelled work.
- Shared-team task language uses actual assignee names instead of saying `you`.

## Last Passing Checks

After the 2026-06-27 app-side repair:

- `npm exec tsc -- --noEmit` passed.
- `npm run lint` passed with only two old warnings in `test-supabase-puburl.mjs`.
- `npm run build` passed.
- Browser smoke test passed:
  - Dashboard loads as Mehdi Admin.
  - Admin can expand a post and open the comment composer.
  - Admin composer shows `AI draft` and `Create comment`.
  - Admin controls show `Cancel task`, not hard `Delete`.
  - Member view loads as Jebbar with `My Tasks` / `All Team Tasks`, breadcrumbs, `Mark done`, `Rejected`, and `Removed`.
  - All-team tab shows the read-only timeline and filter.
  - No console errors seen during the smoke test.

Browser smoke did not live-verify a member `Copy comment` button because the current Jebbar queue had only post tasks. That path is covered by TypeScript/build and the task-card code path, but a future smoke test should create or use a real comment task if visual verification is needed.

## Remaining Chunks After Chunk 6

Remaining:

1. Chunk 7: Common Home Analytics.
2. Chunk 8: File Architecture Cleanup.

## Useful Code Pointers

In `src/app/page.tsx`:

- `commentDrafts` state near top of `Home`.
- `handleCreateComment` inserts comments.
- `updateComment` handles comment updates with missing-column fallback.
- `assignedTasks` derives member tasks.
- `TaskSection` renders member task cards.
- `MemberTaskFlow` renders member task order line.
- `TeamTimelineSection` renders the Chunk 6 read-only all-team timeline.
- `PostCard` renders admin post card and passes comment composer props.
- `CommentComposer` has body, assignee, submit, and the `AI draft` checkbox.
- `ThreadedComment` renders comments/replies and shows AI badges.
- `copyLinkToClipboard` is used for both Reddit links and comment text.

In `src/lib/types.ts`:

- `RedditComment` already has optional `isAiDraft`, `postedUrl`, `assignedAt`.
- `DbCommentRow` already has optional `is_ai_draft`, `posted_url`, `assigned_at`.
- `AssignedTask` now includes comment context fields such as `isAiDraft`, `postedUrl`, `parentCommentId`, and `parentCommentBody`.

In `src/lib/helpers.ts`:

- `getSubredditName`, `isUsableRedditLink`, status helpers already exist.

## Caution

- Do not click `Cancel task` in browser smoke tests unless intentionally testing destructive-like state changes; it changes DB data.
- The old DB is missing `is_ai_draft`, so insert/update paths must fallback when missing.
- Keep member UI simple and child-readable.
- Avoid adding a major refactor before Chunk 8; Chunk 8 is for file architecture cleanup.
