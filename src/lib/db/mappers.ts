import { toStatus } from "@/lib/helpers";
import type {
  DbCommentRow,
  DbPostRow,
  RedditComment,
  RedditPost,
} from "@/lib/types";

export function dbCommentToApp(row: DbCommentRow): RedditComment {
  return {
    id: row.id,
    body: row.body,
    assigneeId: row.assignee_id ?? "",
    status: toStatus(row.status),
    createdAt: row.created_at,
    parentId: row.parent_id ?? null,
    isAiDraft: Boolean(row.is_ai_draft),
    postedUrl: row.posted_url ?? "",
    assignedAt: row.assigned_at ?? row.created_at,
  };
}

export function dbPostToApp(row: DbPostRow): RedditPost {
  return {
    id: row.id,
    title: row.title,
    postBody: row.post_body,
    subredditUrl: row.subreddit_url ?? "",
    publishedUrl: row.published_url ?? "",
    assigneeId: row.assignee_id ?? "",
    status: toStatus(row.status),
    createdAt: row.created_at,
    softDeleted: Boolean(row.soft_deleted),
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
    rejectionReason: row.rejection_reason ?? null,
    assignedAt: row.assigned_at ?? row.created_at,
    comments: (row.reddit_comments ?? []).map(dbCommentToApp),
  };
}
