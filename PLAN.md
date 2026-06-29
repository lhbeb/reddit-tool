# Reddit Task App UI/UX Implementation Plan

This file exists so the UI/UX work can continue cleanly after a context compact, reconnect, or handoff.

## Current Progress

- Chunk 1 / Phase 1 is complete: admin dashboard structure was simplified.
- Chunk 2 / Phase 2 is complete: admin post cards are now compact by default and expandable for full details.
- Chunk 3 / Phase 3 is complete: member dashboard is pending-first, done tasks are collapsed, and each task has one clear action path.
- Chunk 4 / Phase 4 is complete: comment threads now collapse deeper replies and keep reply composers opt-in.
- Chunk 5 / Phase 5 is complete: admin search, sort, metric filters, remembered preferences, and smarter empty states are implemented.
- The create-post form moved into a modal behind `+ New post`.
- The always-visible team editor moved into a collapsible `Team settings` panel.
- The left admin panel is now focused on search and filters.
- The assignment queue changed from a horizontal drag canvas to a vertical list.
- Done work is hidden by default through the `Active work` status filter.
- Search was added early, so part of Phase 5 is already started.

## Remaining Chunks

There is 1 main chunk left.

## Chunk 2 / Phase 2: Post Card Redesign

Status: Complete.

Goal: make each post task easy to scan at a glance.

Collapsed post card should show:

- Subreddit.
- Status.
- One-line title.
- Post assignee chip/avatar.
- Comment progress, for example `2/4 done`.
- One clear action: `Expand` or `Open`.

Expanded post card should show:

- Full post body.
- Subreddit link.
- Compact assignment flow.
- Admin controls.
- Comment composer.
- Threaded comments.

Implementation notes:

- Remove the left vote bar from admin post cards.
- Keep each task visually separated as its own entity.
- Make `AssignmentFlow` smaller, more like a progress line than two large boxes.
- Only render the full comment tree when the post card is expanded.
- Keep the post task and its comments visibly connected, like a Reddit thread.

Main targets:

- `src/app/page.tsx`
- `PostCard`
- `AssignmentFlow`
- `ThreadedComment`

## Chunk 3 / Phase 3: Member Experience

Status: Complete.

Goal: when a team member logs in, they immediately understand what to do next.

Changes:

- Show pending tasks first.
- Keep done tasks visually quieter or collapsed.
- Remove the static help sidebar from the member dashboard.
- For post tasks: show one proof input and one `Mark done` button.
- For comment tasks: show `Open post` or copy-link action only when the Reddit post link exists.
- Avoid showing disabled or locked buttons unless they explain an important dependency.
- Make notifications and red-dot behavior match unfinished assigned work.

Main targets:

- `src/app/page.tsx`
- Member dashboard layout.
- `TaskSection`
- `MemberTaskFlow`

## Chunk 4 / Phase 4: Comments And Threading

Status: Complete.

Goal: comments should feel like a real Reddit thread without overwhelming the page.

Changes:

- Keep nested replies indented down and to the right.
- Collapse deeper replies behind `Show replies`.
- In collapsed post cards, show only comment counts and pending/working state.
- Keep reply composer hidden until `Reply` is clicked.
- Make comment tasks clearly attached to their parent post.

Main targets:

- `ThreadedComment`
- `CommentComposer`
- `getChildComments`

## Chunk 5 / Phase 5: Search, Sort, And Filtering

Status: Complete.

Goal: admin can find any task quickly.

Baseline:

- Search input exists.
- Status filter exists.
- Assignee filter exists.
- Active work is the default.

Completed in Chunk 5:

- Add sort options: newest first, oldest first, by assignee.
- Make metric cards clickable filters.
- Remember filter and sort preferences in localStorage.
- Improve empty-state text based on the active filter.

Main targets:

- Admin filter panel.
- Metric cards.
- `filteredPosts` memo.

## Chunk 6 / Phase 6: Polish Before Vercel

Goal: make the app feel stable and ready to use online.

Changes:

- Replace the loading screen with skeleton cards.
- Add confirmation modal for delete.
- Add toast feedback for saves, copies, and status changes.
- Improve empty states.
- Add show/hide toggle for the login password field.
- Improve mobile layout.
- Check Vercel readiness and Supabase environment variables.

Main targets:

- `src/app/page.tsx`
- `src/app/globals.css`
- Supabase env/config files if needed.

## UX Principles To Preserve

- Minimal and clear enough for an 8-year-old to understand.
- No big dashboard headings.
- No spaced-out letter headings.
- The admin, Mehdi Admin, is the only user who can assign tasks.
- Members only see their pending and done tasks.
- Notification red dot stays on while the member has unfinished assigned work.
- Each post task is a separate entity.
- Comments must visually belong to their parent post.
- Post assignees must provide the final Reddit post link before comment assignees can complete comment work.

## Verification Checklist For Each Chunk

- Run `npm run lint`.
- Run `npm run build`.
- Smoke test in the browser at `http://localhost:3000`.
- Check admin login.
- Check member login.
- Check that existing Supabase data still loads.
- Check that no hydration warnings appear in the console.
