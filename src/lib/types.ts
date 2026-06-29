export const STATUSES = ["queued", "working", "done", "rejected", "removed", "cancelled"] as const;

export type Status = (typeof STATUSES)[number];
export type StatusFilter = "active" | "all" | Status;
export type SortMode = "newest" | "oldest" | "assignee";
export type ScopeFilter = "all" | "with-comments";

export type CommentDraft = {
  body: string;
  assigneeId: string;
  isAiDraft: boolean;
};

export type TeamMember = {
  id: string;
  slug: string;
  name: string;
  isAdmin: boolean;
};

export type RedditComment = {
  id: string;
  body: string;
  assigneeId: string;
  status: Status;
  createdAt: string;
  parentId?: string | null;
  isAiDraft?: boolean;
  postedUrl?: string;
  assignedAt?: string;
};

export type RedditPost = {
  id: string;
  title: string;
  postBody: string;
  subredditUrl: string;
  publishedUrl?: string;
  assigneeId: string;
  status: Status;
  createdAt: string;
  softDeleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  rejectionReason?: string | null;
  assignedAt?: string;
  comments: RedditComment[];
};

export type AssignedTask = {
  id: string;
  kind: "post" | "comment";
  title: string;
  body: string;
  subredditUrl: string;
  publishedUrl?: string;
  assigneeId: string;
  postAssigneeId: string;
  commentAssigneeIds: string[];
  status: Status;
  createdAt: string;
  postId: string;
  postSoftDeleted?: boolean;
  isAiDraft?: boolean;
  postedUrl?: string;
  parentCommentId?: string | null;
  parentCommentBody?: string | null;
  commentId?: string;
  mediaUrl?: string;
};

export type ActivityLogItem = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  createdAt: string;
  detail: string;
  kind: "post" | "comment" | "system";
  subreddit: string;
  tone: "accent" | "green" | "yellow" | "red" | "muted";
};

export type DbCommentRow = {
  id: string;
  body: string;
  assignee_id: string | null;
  status: string;
  created_at: string;
  parent_id?: string | null;
  is_ai_draft?: boolean | null;
  posted_url?: string | null;
  assigned_at?: string | null;
};

export type DbPostRow = {
  id: string;
  title: string;
  post_body: string;
  subreddit_url: string | null;
  published_url?: string | null;
  assignee_id: string | null;
  status: string;
  created_at: string;
  soft_deleted?: boolean | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  rejection_reason?: string | null;
  assigned_at?: string | null;
  reddit_comments?: DbCommentRow[];
};

export type SupabaseSelectPlan = {
  label: string;
  query: string;
};

export type SupabaseErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};
