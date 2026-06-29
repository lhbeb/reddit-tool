# Reddit Maintenance Platform Plan

This roadmap supersedes the older UI-only chunk plan. The goal is to turn the app into a platform for maintaining real Reddit posts across their full lifecycle.

## Chunk 1: Lifecycle Schema And Status Foundation

Status: Complete.

- Expand `task_status` with `rejected`, `removed`, and `cancelled`.
- Add lifecycle columns to posts and comments.
- Add `post_history` for audit feed data.
- Extend DB health checks to report lifecycle tables, enum values, and columns.
- Update app status types so new DB statuses do not break the current UI.

## Chunk 2: Type And Helper Extraction

Status: Complete.

- Move shared post/comment/team/task types into `src/lib/types.ts`.
- Move helpers into `src/lib/helpers.ts`.
- Replace short date formatting with `timeAgo`.
- Keep `page.tsx` behavior unchanged while reducing repeated inline logic.

## Chunk 3: Clean Status UI And Admin Controls

Status: Complete.

- Replace emoji status pills with clean dot status labels.
- Add rejected/removed/cancelled to admin status selectors.
- Simplify collapsed post cards.
- Hide comment composer until Admin clicks `Add comment`.

## Chunk 4: Soft Delete And History Logging In App

Status: Complete.

- Convert delete actions into soft delete: `cancelled`, `soft_deleted`, `deleted_at`, `deleted_by`.
- Filter cancelled/soft-deleted work out of active queues.
- Write meaningful `post_history` rows from app actions when needed.

## Chunk 5: Member Context And AI Drafts

Status: Complete.

- Add `is_ai_draft` to admin comment creation.
- Show member badge and copy-comment action for AI drafts.
- Add breadcrumbs for comment tasks: subreddit, post title, and comment context.
- Add member buttons for rejected/removed reports.

## Chunk 6: Member Tabs And Shared Team View

Status: Complete.

- Add `My Tasks` and `All Team Tasks` tabs for members.
- Make all-team timeline read-only and filterable.
- Keep pending tasks first and done/closed work quieter.

## Chunk 7: Common Home Analytics

- Create `/home`.
- Show post stats, completion rate, rejected/cancelled counts.
- Show leaderboard by member.
- Show recent activity from `post_history`.

## Chunk 8: File Architecture Cleanup

Status: In progress.

- First pass complete: moved the large presentational task/card component block into `src/components/reddit/task-components.tsx`.
- Second pass complete: moved read-side Supabase helpers into `src/lib/db/*` and kept write mutations in `page.tsx`.
- Fixed the React style warning in `MetricCard` by removing mixed border shorthand/side-specific inline styles.
- Added a navbar notification dropdown as a team activity log for assignments, link sharing, and closed task updates.
- Added project wording polish: visible queued work says `mazal`, and visible posted/link-ready states say `tla7` while DB values stay unchanged.
- Move large page subcomponents into focused files.
- Keep `src/app/page.tsx` responsible only for auth, loading, and top-level routing.
- Remove visual noise left by earlier inline component growth.
