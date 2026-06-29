"use client";

import type React from "react";
import { useState } from "react";
import Image from "next/image";
import {
  avatarColor,
  getAssigneeList,
  getAvatarUrl,
  getChildComments,
  getCommentAssigneeIds,
  getCommentDraftKey,
  getDescendantCommentCount,
  getMemberName,
  getStatusGlowClass,
  getSubredditName,
  initials,
  isClosedStatus,
  isOpenStatus,
  isUsableRedditLink,
  statusLabels,
  timeAgo,
} from "@/lib/helpers";
import type {
  ActivityLogItem,
  AssignedTask,
  CommentDraft,
  RedditComment,
  RedditPost,
  Status,
  TeamMember,
} from "@/lib/types";

export function Avatar({
  member,
  size = 24,
  fontSize = "0.62rem",
  index = 0,
}: {
  member: TeamMember;
  size?: number;
  fontSize?: string;
  index?: number;
}) {
  const url = getAvatarUrl(member.slug);
  const color = avatarColor(index);
  
  if (url) {
    return (
      <Image
        src={url}
        alt={member.name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontSize: fontSize,
        fontWeight: 900,
        flexShrink: 0,
      }}
    >
      {initials(member.name)}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PostCard
═══════════════════════════════════════════════════════════════ */
export function PostCard({
  post, team, commentDraft, commentDrafts, openReplyComposerIds,
  onCommentDraftChange, onCreateComment, onDeletePost, onUpdatePost, onUpdateComment, onToggleReply,
}: {
  post: RedditPost;
  team: TeamMember[];
  commentDraft: CommentDraft;
  commentDrafts: Record<string, CommentDraft>;
  openReplyComposerIds: Record<string, boolean>;
  onCommentDraftChange: (key: string, value: CommentDraft) => void;
  onCreateComment: (postId: string, parentId?: string | null) => boolean | Promise<boolean>;
  onDeletePost: (postId: string) => void;
  onUpdatePost: (postId: string, changes: Partial<RedditPost>) => void;
  onUpdateComment: (postId: string, commentId: string, changes: Partial<RedditComment>) => void;
  onToggleReply: (commentId: string) => void;
  currentUser: TeamMember;
  onDeleteTask: (task: AssignedTask) => void;
}) {
  const [showControls, setShowControls] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRootComposerOpen, setIsRootComposerOpen] = useState(false);
  const totalComments = post.comments.length;
  const finishedComments = post.comments.filter((c) => c.status === "done").length;
  const activeComments = post.comments.filter((c) => isOpenStatus(c.status)).length;
  const openComments = activeComments;
  const rootComments = getChildComments(post.comments);
  const postLinkReady = isUsableRedditLink(post.publishedUrl);
  const commentProgressText =
    totalComments === 0
      ? "0 comments"
      : activeComments === 0
        ? "All comments done"
        : `${activeComments} active comment${activeComments === 1 ? "" : "s"}`;
  const expandedCommentProgressText =
    totalComments > 0 ? `${finishedComments}/${totalComments} comments done` : "0 comments";
  const commentTone =
    totalComments > 0 && openComments === 0
      ? "var(--green)"
      : totalComments > 0
        ? "var(--yellow)"
        : "var(--text-muted)";
  const glowClass = getStatusGlowClass(post.softDeleted ? "cancelled" : post.status);
  const rootCommentDraftReady = commentDraft.body.trim().length > 0 && Boolean(commentDraft.assigneeId);

  async function submitRootComment() {
    if (!rootCommentDraftReady) return false;
    const created = await onCreateComment(post.id);
    if (created) setIsRootComposerOpen(false);
    return created;
  }

  function toggleExpanded() {
    if (isExpanded) setShowControls(false);
    if (isExpanded) setIsRootComposerOpen(false);
    setIsExpanded((value) => !value);
  }

  return (
    <article
      className={glowClass}
      style={{
        width: "100%",
        borderRadius: "14px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-bright)",
        overflow: "hidden",
      }}
    >
      {/* ── Collapsed header ── */}
      <div style={{ padding: "16px 18px" }}>
        {/* Row 1: Avatar+Name (left) ↔ Subreddit+Status+Expand (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <TeamMemberChip memberId={post.assigneeId} team={team} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent)" }}>
              r/{getSubredditName(post.subredditUrl)}
            </span>
            <StatusPill status={post.status} />
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={toggleExpanded}
              className={isExpanded ? "btn-ghost" : "btn-primary"}
              style={{ height: "32px", padding: "0 14px", fontSize: "0.78rem", borderRadius: "8px" }}
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {/* Row 2: Post title */}
        <h3
          title={post.title}
          style={{
            marginTop: "12px",
            fontSize: "1.02rem",
            fontWeight: 850,
            lineHeight: 1.4,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {post.title}
        </h3>

        {/* Row 3: Comment summary strip */}
        <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              color: commentTone,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {commentProgressText}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: postLinkReady ? "var(--green)" : "var(--text-muted)",
              background: "var(--bg-elevated)",
              border: `1px solid ${postLinkReady ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
              borderRadius: "999px",
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {postLinkReady ? "✓ Post live" : "⏳ Waiting for link"}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.73rem", fontWeight: 700 }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Post body */}
          <div style={{ padding: "16px 18px" }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Post body
            </p>
            <p
              style={{
                marginTop: "8px",
                whiteSpace: "pre-wrap",
                fontSize: "0.88rem",
                lineHeight: 1.75,
                color: "var(--text-secondary)",
              }}
            >
              {post.postBody}
            </p>

            {/* Links row */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" }}>
              {post.subredditUrl && (
                <a
                  href={post.subredditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-dark"
                  style={{ fontSize: "0.76rem", padding: "7px 12px" }}
                >
                  ↗ Open subreddit
                </a>
              )}
              {postLinkReady ? (
                <a
                  href={post.publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-dark"
                  style={{ fontSize: "0.76rem", padding: "7px 12px" }}
                >
                  ↗ Open Reddit post
                </a>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700, alignSelf: "center" }}>
                  No Reddit post link yet.
                </span>
              )}
            </div>
          </div>

          {/* Assignment flow */}
          <div style={{ padding: "0 18px 4px" }}>
            <AssignmentFlow post={post} team={team} />
          </div>

          {/* Admin controls toggle */}
          <div style={{ padding: "8px 18px 16px" }}>
            <button
              type="button"
              onClick={() => setShowControls((value) => !value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.76rem",
                fontWeight: 800,
                color: showControls ? "var(--accent)" : "var(--text-muted)",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true">{showControls ? "▾" : "▸"}</span>
              Admin controls
            </button>

            {showControls && (
              <div
                className="admin-controls-grid"
                style={{
                  marginTop: "10px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "12px",
                }}
              >
                <select
                  value={post.assigneeId}
                  onChange={(e) => onUpdatePost(post.id, { assigneeId: e.target.value })}
                  className="input"
                  style={{ height: "38px", fontSize: "0.82rem" }}
                  aria-label="Post assignee"
                >
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <select
                  value={post.status}
                  onChange={(e) => onUpdatePost(post.id, { status: e.target.value as Status })}
                  className="input"
                  style={{ height: "38px", fontSize: "0.82rem" }}
                  aria-label="Post status"
                >
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onDeletePost(post.id)}
                  title="Cancel this post"
                  style={{
                    height: "38px",
                    padding: "0 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,69,0,0.3)",
                    background: "rgba(255,69,0,0.08)",
                    color: "#ff7043",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel task
                </button>
                <input
                  value={post.publishedUrl ?? ""}
                  onChange={(e) => onUpdatePost(post.id, { publishedUrl: e.target.value })}
                  placeholder="Final Reddit post link"
                  className="input"
                  style={{ height: "38px", fontSize: "0.82rem", gridColumn: "1 / -1" }}
                />
              </div>
            )}
          </div>

          {/* Comments section */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 18px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "14px",
              }}
            >
              <div>
                <h4 style={{ fontWeight: 850, fontSize: "0.92rem" }}>
                  Comments
                  <span style={{ marginLeft: "8px", fontSize: "0.75rem", fontWeight: 800, color: commentTone }}>
                    {expandedCommentProgressText}
                  </span>
                </h4>
                <p style={{ marginTop: "3px", color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 700 }}>
                  Assign comments. Replies nest like a Reddit thread.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRootComposerOpen((value) => !value)}
                className={isRootComposerOpen ? "btn-ghost" : "btn-primary"}
                style={{ height: "32px", padding: "0 12px", fontSize: "0.76rem", flexShrink: 0 }}
              >
                {isRootComposerOpen ? "Cancel" : "+ Add comment"}
              </button>
            </div>

            {isRootComposerOpen && (
              <div style={{ marginBottom: "12px" }}>
                <CommentComposer
                  assigneeId={commentDraft.assigneeId}
                  body={commentDraft.body}
                  buttonLabel="Create comment"
                  isAiDraft={commentDraft.isAiDraft}
                  onAiDraftChange={(isAiDraft) =>
                    onCommentDraftChange(post.id, { ...commentDraft, isAiDraft })
                  }
                  onAssigneeChange={(assigneeId) =>
                    onCommentDraftChange(post.id, { ...commentDraft, assigneeId })
                  }
                  onBodyChange={(body) => onCommentDraftChange(post.id, { ...commentDraft, body })}
                  onSubmit={submitRootComment}
                  placeholder="Paste comment text"
                  team={team}
                />
              </div>
            )}

            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: rootComments.length === 0 ? "0" : "8px",
              }}
            >
              {rootComments.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "20px",
                    fontSize: "0.82rem",
                    color: "var(--text-muted)",
                    fontWeight: 700,
                  }}
                >
                  No comments yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {rootComments.map((comment) => (
                    <ThreadedComment
                      key={comment.id}
                      comment={comment}
                      comments={post.comments}
                      getDraft={(parentId) =>
                        commentDrafts[getCommentDraftKey(post.id, parentId)] ?? {
                          body: "",
                          assigneeId: team[0]?.id ?? "",
                          isAiDraft: false,
                        }
                      }
                      isReplyOpen={(commentId) => Boolean(openReplyComposerIds[commentId])}
                      level={0}
                      onCreateReply={async (parentId) => {
                        const created = await onCreateComment(post.id, parentId);
                        if (created) onToggleReply(parentId);
                        return created;
                      }}
                      onDraftChange={(parentId, draftValue) =>
                        onCommentDraftChange(getCommentDraftKey(post.id, parentId), draftValue)
                      }
                      onUpdateComment={(commentId, changes) =>
                        onUpdateComment(post.id, commentId, changes)
                      }
                      onToggleReply={onToggleReply}
                      postLinkReady={postLinkReady}
                      team={team}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components (unchanged visual design)
═══════════════════════════════════════════════════════════════ */
export function TopNav({
  currentUser, currentUserIndex, notifications, pendingCount, onLogout, team,
}: {
  currentUser: TeamMember;
  currentUserIndex: number;
  notifications: ActivityLogItem[];
  pendingCount: number;
  onLogout: () => void;
  team: TeamMember[];
}) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(14,14,14,0.85)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        height: "58px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
        <div
          style={{
            background: "rgba(255,69,0,0.1)",
            border: "1px solid rgba(255,69,0,0.2)",
            borderRadius: "10px",
            padding: "5px 10px",
          }}
        >
          <Image
            src="/reddit-1.svg"
            alt="Reddit logo"
            width={80}
            height={28}
            className="h-6 w-auto"
            style={{
              filter:
                "brightness(0) saturate(100%) invert(38%) sepia(99%) saturate(700%) hue-rotate(353deg) brightness(100%) contrast(102%)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-bright)",
            borderRadius: "999px",
            padding: "4px 12px 4px 4px",
          }}
        >
          <Avatar member={currentUser} size={28} fontSize="0.65rem" index={currentUserIndex} />
          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{currentUser.name}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <NotificationBell count={pendingCount} notifications={notifications} team={team} />
        <button
          onClick={onLogout}
          className="btn-ghost"
          style={{ fontSize: "0.75rem", padding: "6px 14px" }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

export function MetricCard({
  active = false, accent, hint, label, onClick, value,
}: {
  active?: boolean;
  accent: string;
  hint: string;
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`metric-card ${active ? "is-active" : ""}`}
      style={{
        background: "var(--bg-card)",
        borderRadius: "12px",
        borderTopWidth: "2px",
        borderRightWidth: "1px",
        borderBottomWidth: "1px",
        borderLeftWidth: "1px",
        borderTopStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftStyle: "solid",
        borderTopColor: accent,
        borderRightColor: active ? accent : "var(--border)",
        borderBottomColor: active ? accent : "var(--border)",
        borderLeftColor: active ? accent : "var(--border)",
        padding: "14px 18px",
        color: "var(--text-primary)",
      }}
    >
      <p
        style={{
          fontSize: "0.74rem",
          fontWeight: 800,
          color: active ? accent : "var(--text-muted)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "1.75rem",
          fontWeight: 900,
          lineHeight: 1.1,
          color: accent,
          marginTop: "4px",
        }}
      >
        {value}
      </p>
      <p style={{ marginTop: "4px", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>
        {hint}
      </p>
    </button>
  );
}
export function TeamMemberChip({
  compact = false,
  label,
  memberId,
  team,
}: {
  compact?: boolean;
  label?: string;
  memberId: string;
  team: TeamMember[];
}) {
  const memberIndex = team.findIndex((member) => member.id === memberId);
  const colorIndex = memberIndex >= 0 ? memberIndex : 0;
  const name = getMemberName(team, memberId);
  const member = team.find((m) => m.id === memberId) || team[0];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "6px" : "8px",
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        borderRadius: "999px",
        padding: compact ? "4px 10px 4px 4px" : "4px 12px 4px 4px",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      {label && (
        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 800 }}>
          {label}
        </span>
      )}
      <Avatar member={member} size={compact ? 32 : 36} fontSize={compact ? "0.8rem" : "0.9rem"} index={colorIndex} />
      <span
        style={{
          color: "var(--text-primary)",
          fontSize: compact ? "0.78rem" : "0.82rem",
          fontWeight: 800,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </span>
  );
}
export function StatusPill({ status }: { status: Status }) {
  const config: Record<Status, { label: string; bg: string; color: string }> = {
    queued: { label: "mazal", bg: "rgba(255,69,0,0.10)", color: "#ff7043" },
    working: { label: "Working", bg: "rgba(234,179,8,0.12)", color: "#fbbf24" },
    done: { label: "Done", bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
    rejected: { label: "Rejected", bg: "rgba(248,113,113,0.12)", color: "#f87171" },
    removed: { label: "Removed", bg: "rgba(148,163,184,0.14)", color: "#94a3b8" },
    cancelled: { label: "Cancelled", bg: "rgba(148,163,184,0.14)", color: "#94a3b8" },
  };
  const { label, bg, color } = config[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color,
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "0.72rem",
        fontWeight: 800,
        gap: "6px",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

export function AiDraftBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        border: "1px solid rgba(108,99,255,0.28)",
        background: "rgba(108,99,255,0.12)",
        color: "var(--indigo)",
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "0.7rem",
        fontWeight: 850,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "var(--indigo)",
        }}
      />
      AI draft
    </span>
  );
}

export function AssignmentFlow({ post, team }: { post: RedditPost; team: TeamMember[] }) {
  const commentAssigneeIds = getCommentAssigneeIds(post.comments);
  const finishedComments = post.comments.filter((c) => c.status === "done").length;
  const totalComments = post.comments.length;
  const postLinkReady = isUsableRedditLink(post.publishedUrl);
  const commentAssignees =
    totalComments > 0 ? getAssigneeList(team, commentAssigneeIds) : "Add comment assignments";
  const commentsReady = totalComments > 0 && finishedComments === totalComments;

  return (
    <div
      style={{
        marginTop: "14px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "10px 12px",
      }}
    >
      <p style={{ color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 800 }}>
        Assignment path
      </p>
      <div className="assignment-flow-strip" style={{ marginTop: "8px" }}>
        <div className="assignment-flow-item">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ color: "var(--text-primary)", fontSize: "0.8rem", fontWeight: 850 }}>
              1. Post + title
            </span>
            <StatusPill status={post.status} />
          </div>
          <div style={{ marginTop: "8px" }}>
            <TeamMemberChip compact memberId={post.assigneeId} team={team} />
          </div>
          <p style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.73rem", lineHeight: 1.45 }}>
            {postLinkReady ? "The final Reddit link is ready." : "This person still needs to paste the Reddit post link."}
          </p>
        </div>

        <span className="post-flow-arrow" aria-hidden="true">→</span>

        <div className="assignment-flow-item">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ color: "var(--text-primary)", fontSize: "0.8rem", fontWeight: 850 }}>
              2. Comments
            </span>
            <span
              style={{
                color: commentsReady ? "var(--green)" : totalComments > 0 ? "var(--yellow)" : "var(--text-muted)",
                fontSize: "0.74rem",
                fontWeight: 850,
                whiteSpace: "nowrap",
              }}
            >
              {totalComments > 0 ? `${finishedComments}/${totalComments} done` : "0 assigned"}
            </span>
          </div>
          <p
            title={commentAssignees}
            style={{
              marginTop: "8px",
              color: "var(--text-primary)",
              fontSize: "0.78rem",
              fontWeight: 800,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {commentAssignees}
          </p>
          <p style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.73rem", lineHeight: 1.45 }}>
            {postLinkReady ? "Comment assignees can open the post and work." : "Comment work waits until the post link exists."}
          </p>
        </div>
      </div>
    </div>
  );
}
export function MemberTaskFlow({
  personal = true,
  task,
  team,
}: {
  personal?: boolean;
  task: AssignedTask;
  team: TeamMember[];
}) {
  const isPostTask = task.kind === "post";
  const postLinkReady = isUsableRedditLink(task.publishedUrl);
  const stepOneReady = isPostTask ? task.status === "done" && postLinkReady : postLinkReady;
  const stepTwoReady = isClosedStatus(task.status);
  const postPerson = isPostTask && personal ? "you" : getMemberName(team, task.postAssigneeId);
  const commentPerson =
    !isPostTask && personal
      ? "you"
      : isPostTask
        ? getAssigneeList(team, task.commentAssigneeIds)
        : getMemberName(team, task.assigneeId);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "10px",
        padding: "8px 10px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        fontSize: "0.74rem",
        fontWeight: 700,
        color: "var(--text-muted)",
        flexWrap: "wrap",
      }}
      aria-label="Task order"
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: stepOneReady ? "var(--green)" : "var(--accent-dim)",
          color: stepOneReady ? "#fff" : "var(--accent)",
          fontSize: "0.65rem",
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {stepOneReady ? "✓" : "1"}
      </span>
      <span style={{ color: stepOneReady ? "var(--green)" : "var(--text-secondary)" }}>
        Post · {postPerson}
      </span>
      <span style={{ color: "var(--border-bright)", padding: "0 2px" }}>|</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: stepTwoReady ? "var(--green)" : "var(--bg-card)",
          color: stepTwoReady ? "#fff" : "var(--text-muted)",
          border: stepTwoReady ? "none" : "1px solid var(--border-bright)",
          fontSize: "0.65rem",
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {stepTwoReady ? "✓" : "2"}
      </span>
      <span style={{ color: stepTwoReady ? "var(--green)" : "var(--text-muted)" }}>
        {isPostTask ? "Comments" : personal ? "Your comment" : "Comment"} · {commentPerson}
      </span>
    </div>
  );
}
export function NotificationBell({
  count,
  notifications,
  team = [],
}: {
  count: number;
  notifications: ActivityLogItem[];
  team?: TeamMember[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasPending = count > 0;
  const toneColor: Record<ActivityLogItem["tone"], string> = {
    accent: "var(--accent)",
    green: "var(--green)",
    yellow: "var(--yellow)",
    red: "#f87171",
    muted: "var(--text-muted)",
  };

  return (
    <div
      style={{
        position: "relative",
      }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={hasPending ? `${count} pending tasks. Open team log.` : "Open team log."}
        title={hasPending ? `${count} pending tasks` : "Team log"}
        onClick={() => setIsOpen((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-bright)",
          borderRadius: "999px",
          padding: "5px 12px 5px 5px",
          color: "var(--text-primary)",
        }}
      >
        <span
          style={{
            position: "relative",
            width: "28px",
            height: "28px",
            background: hasPending ? "var(--accent-dim)" : "var(--bg-card)",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
          }}
          className={hasPending ? "pulse-ring" : ""}
        >
          <svg
            aria-hidden="true"
            style={{ width: "14px", height: "14px", color: hasPending ? "var(--accent)" : "var(--text-muted)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.3"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0"
            />
          </svg>
          {hasPending && (
            <span
              style={{
                position: "absolute",
                top: "1px",
                right: "1px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent)",
                border: "2px solid var(--bg-base)",
              }}
            />
          )}
        </span>
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 800,
            color: hasPending ? "var(--accent)" : "var(--text-muted)",
            minWidth: "16px",
            textAlign: "center",
          }}
        >
          {count}
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Team notification log"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: "min(440px, calc(100vw - 24px))",
            maxHeight: "min(520px, calc(100vh - 86px))",
            overflow: "hidden",
            background: "var(--bg-card)",
            border: "1px solid var(--border-bright)",
            borderRadius: "14px",
            boxShadow: "0 18px 48px rgba(0,0,0,0.5)",
            zIndex: 80,
          }}
        >
          <div
            style={{
              padding: "13px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <p style={{ fontSize: "0.88rem", fontWeight: 900 }}>Team log</p>
              <p style={{ marginTop: "2px", color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 750 }}>
                Everyone can see assignments, links, and completed work.
              </p>
            </div>
            <span
              style={{
                border: "1px solid var(--border)",
                borderRadius: "999px",
                background: "var(--bg-elevated)",
                color: "var(--accent)",
                padding: "4px 9px",
                fontSize: "0.72rem",
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              {notifications.length} logs
            </span>
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "22px", textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 800 }}>
                No team updates yet.
              </p>
            </div>
          ) : (
            <div
              style={{
                maxHeight: "430px",
                overflowY: "auto",
                padding: "8px",
              }}
            >
              {notifications.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px minmax(0, 1fr)",
                    gap: "12px",
                    alignItems: "center",
                    padding: "10px 9px",
                    borderRadius: "10px",
                  }}
                >
                  {(() => {
                    const actor = team.find((m) => m.id === item.actorId);
                    const actorIndex = team.findIndex((m) => m.id === item.actorId);
                    return actor
                      ? <Avatar member={actor} size={32} fontSize="0.8rem" index={actorIndex >= 0 ? actorIndex : 0} />
                      : <span aria-hidden="true" style={{ width: "9px", height: "9px", marginTop: "12px", borderRadius: "999px", background: toneColor[item.tone], flexShrink: 0 }} />;
                  })()}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: "0.8rem", lineHeight: 1.45, fontWeight: 800 }}>
                      <span style={{ color: toneColor[item.tone] }}>{item.actorName}</span>{" "}
                      <span style={{ color: "var(--text-primary)" }}>{item.action}</span>
                    </p>
                    <p
                      title={item.detail}
                      style={{
                        marginTop: "3px",
                        color: "var(--text-secondary)",
                        fontSize: "0.76rem",
                        lineHeight: 1.45,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.subreddit} / {item.detail}
                    </p>
                    <p style={{ marginTop: "3px", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 750 }}>
                      {item.kind === "post" ? "Post" : item.kind === "comment" ? "Comment" : "System"} · {timeAgo(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <span
            style={{
              display: "block",
              height: "4px",
              background: hasPending ? "var(--accent)" : "var(--border)",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function CommentComposer({
  assigneeId, body, buttonLabel, isAiDraft, onAiDraftChange,
  onAssigneeChange, onBodyChange, onSubmit, placeholder, team,
}: {
  assigneeId: string;
  body: string;
  buttonLabel: string;
  isAiDraft: boolean;
  onAiDraftChange: (isAiDraft: boolean) => void;
  onAssigneeChange: (assigneeId: string) => void;
  onBodyChange: (body: string) => void;
  onSubmit: () => void | boolean | Promise<void | boolean>;
  placeholder: string;
  team: TeamMember[];
}) {
  const canSubmit = body.trim().length > 0 && Boolean(assigneeId);

  return (
    <div
      className="comment-composer"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "12px",
        display: "grid",
        gridTemplateColumns: "var(--comment-composer-grid, minmax(0, 1fr) 150px 118px auto)",
        gap: "8px",
      }}
    >
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={placeholder}
        className="input"
        style={{ minHeight: "72px", resize: "vertical", fontSize: "0.82rem" }}
      />
      <select
        value={assigneeId}
        onChange={(e) => onAssigneeChange(e.target.value)}
        className="input"
        style={{ height: "38px", alignSelf: "end", fontSize: "0.82rem" }}
      >
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label
        style={{
          alignSelf: "end",
          height: "38px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "7px",
          border: "1px solid var(--border-bright)",
          borderRadius: "8px",
          background: isAiDraft ? "rgba(108,99,255,0.14)" : "var(--bg-card)",
          color: isAiDraft ? "var(--indigo)" : "var(--text-muted)",
          fontSize: "0.76rem",
          fontWeight: 850,
          padding: "0 10px",
          whiteSpace: "nowrap",
        }}
      >
        <input
          checked={isAiDraft}
          onChange={(event) => onAiDraftChange(event.target.checked)}
          type="checkbox"
        />
        AI draft
      </label>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="btn-primary"
        style={{ height: "38px", alignSelf: "end", padding: "0 14px", fontSize: "0.78rem" }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function ThreadedComment({
  comment, comments, getDraft, isReplyOpen, level,
  onCreateReply, onDraftChange, onToggleReply, onUpdateComment, postLinkReady, team,
}: {
  comment: RedditComment;
  comments: RedditComment[];
  getDraft: (parentId: string) => CommentDraft;
  isReplyOpen: (commentId: string) => boolean;
  level: number;
  onCreateReply: (parentId: string) => boolean | Promise<boolean>;
  onDraftChange: (parentId: string, draft: CommentDraft) => void;
  onToggleReply: (commentId: string) => void;
  onUpdateComment: (commentId: string, changes: Partial<RedditComment>) => void;
  postLinkReady: boolean;
  team: TeamMember[];
}) {
  const childComments = getChildComments(comments, comment.id);
  const hiddenReplyCount = getDescendantCommentCount(comments, comment.id);
  const draft = getDraft(comment.id);
  const replyOpen = isReplyOpen(comment.id);
  const [showReplies, setShowReplies] = useState(level < 1);
  const shouldCollapseReplies = level >= 1 && childComments.length > 0;
  const shouldShowReplies = childComments.length > 0 && (!shouldCollapseReplies || showReplies);
  const branchColor = level === 0 ? "rgba(255,69,0,0.34)" : "rgba(255,255,255,0.16)";

  return (
    <div style={{ paddingLeft: level > 0 ? "18px" : "0" }}>
      <div
        style={{
          position: "relative",
          borderLeft: `2px solid ${branchColor}`,
          paddingLeft: "14px",
          marginBottom: "5px",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-5px",
            top: "18px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: level === 0 ? "var(--accent)" : "var(--text-muted)",
          }}
        />

        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "6px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", minWidth: 0 }}>
              <TeamMemberChip compact memberId={comment.assigneeId} team={team} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>
                {level === 0 ? "Comment" : `Reply level ${level}`}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                {timeAgo(comment.createdAt)}
              </span>
              {comment.isAiDraft && <AiDraftBadge />}
            </div>
            <StatusPill status={comment.status} />
          </div>

          <p
            style={{
              marginTop: "8px",
              whiteSpace: "pre-wrap",
              fontSize: "0.83rem",
              lineHeight: 1.7,
              color: "var(--text-secondary)",
            }}
          >
            {comment.body}
          </p>

          <div
            style={{
              marginTop: "10px",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: "6px", flex: 1, minWidth: "220px" }}>
              <select
                value={comment.assigneeId}
                onChange={(e) => onUpdateComment(comment.id, { assigneeId: e.target.value })}
                className="input"
                style={{ height: "32px", fontSize: "0.78rem", flex: 1 }}
                aria-label={`Assignee for comment by ${getMemberName(team, comment.assigneeId)}`}
              >
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={comment.status}
                onChange={(e) =>
                  onUpdateComment(comment.id, { status: e.target.value as Status })
                }
                className="input"
                style={{ height: "32px", fontSize: "0.78rem", flex: 1 }}
                aria-label="Comment status"
              >
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  background: postLinkReady
                    ? "rgba(96,165,250,0.12)"
                    : "rgba(234,179,8,0.12)",
                  color: postLinkReady ? "#60a5fa" : "#fbbf24",
                  borderRadius: "999px",
                  padding: "2px 8px",
                }}
              >
                {postLinkReady ? "tla7" : "Waiting for post link"}
              </span>
              {childComments.length > 0 && (
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 800 }}>
                  {hiddenReplyCount} repl{hiddenReplyCount === 1 ? "y" : "ies"}
                </span>
              )}
              <button
                type="button"
                onClick={() => onToggleReply(comment.id)}
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  background: "transparent",
                  border: "none",
                  color: replyOpen ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                {replyOpen ? "Cancel" : "Reply"}
              </button>
            </div>
          </div>
        </div>

        {replyOpen && (
          <div style={{ margin: "8px 0 8px" }}>
            <CommentComposer
              assigneeId={draft.assigneeId}
              body={draft.body}
              buttonLabel="Reply"
              isAiDraft={draft.isAiDraft}
              onAiDraftChange={(isAiDraft) =>
                onDraftChange(comment.id, { ...draft, isAiDraft })
              }
              onAssigneeChange={(assigneeId) =>
                onDraftChange(comment.id, { ...draft, assigneeId })
              }
              onBodyChange={(body) => onDraftChange(comment.id, { ...draft, body })}
              onSubmit={() => onCreateReply(comment.id)}
              placeholder="Reply to this comment"
              team={team}
            />
          </div>
        )}

        {shouldCollapseReplies && (
          <button
            type="button"
            onClick={() => setShowReplies((value) => !value)}
            style={{
              margin: "4px 0 8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              color: showReplies ? "var(--accent)" : "var(--text-muted)",
              fontSize: "0.75rem",
              fontWeight: 850,
              padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            <span aria-hidden="true">{showReplies ? "▴" : "▾"}</span>
            {showReplies
              ? "Hide replies"
              : `Show ${hiddenReplyCount} repl${hiddenReplyCount === 1 ? "y" : "ies"}`}
          </button>
        )}

        {shouldShowReplies && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {childComments.map((child) => (
              <ThreadedComment
                key={child.id}
                comment={child}
                comments={comments}
                getDraft={getDraft}
                isReplyOpen={isReplyOpen}
                level={level + 1}
                onCreateReply={onCreateReply}
                onDraftChange={onDraftChange}
                onToggleReply={onToggleReply}
                onUpdateComment={onUpdateComment}
                postLinkReady={postLinkReady}
                team={team}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
export function MetricPill({ label, tone, value }: { label: string; tone: "accent" | "green"; value: number }) {
  const color = tone === "accent" ? "var(--accent)" : "var(--green)";
  return (
    <div className="metric-pill">
      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 800 }}>{label}</span>
      <span style={{ color, fontSize: "0.95rem", fontWeight: 900 }}>{value}</span>
    </div>
  );
}

export function TaskGrid({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="task-grid" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function TeamTimelineSection({
  emptyText,
  tasks,
  team, currentUser, onDeleteTask,
}: {
  emptyText: string;
  tasks: AssignedTask[];
  team: TeamMember[];
  currentUser: TeamMember;
  onDeleteTask: (task: AssignedTask) => void;
}) {
  return (
    <section className="task-section-free">
      <div className="task-section-heading">
        <div>
          <h2 style={{ fontWeight: 850, fontSize: "0.98rem" }}>All Team Tasks</h2>
          <p style={{ marginTop: "2px", color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 700 }}>
            Read-only view. Open work stays first; closed work is quieter.
          </p>
        </div>
        <span
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "3px 11px",
            fontSize: "0.75rem",
            fontWeight: 850,
            color: tasks.length > 0 ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: "30px", textAlign: "center" }}>
          <span style={{ fontSize: "1.8rem" }}>✓</span>
          <p
            style={{
              marginTop: "8px",
              fontSize: "0.84rem",
              color: "var(--text-muted)",
              fontWeight: 700,
            }}
          >
            {emptyText}
          </p>
        </div>
      ) : (
        <TaskGrid ariaLabel="All team task cards">
          {tasks.map((task) => {
            const isPostTask = task.kind === "post";
            const isClosed = isClosedStatus(task.status);
            const postLinkReady = isUsableRedditLink(task.publishedUrl);

            return (
              <article
                key={`${task.kind}:${task.id}`}
                className={`${getStatusGlowClass(task.status)} task-kind-${task.kind} member-task-card ${isClosed ? "is-done" : ""}`}
              >
                <div className="member-task-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <TeamMemberChip compact memberId={task.assigneeId} team={team} />
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent)" }}>
                      {getSubredditName(task.subredditUrl)}
                    </span>
                    <StatusPill status={task.status} />
                    {currentUser.isAdmin && (
                      <button
                        type="button"
                        onClick={() => { if (confirm("Delete this task?")) onDeleteTask(task); }}
                        className="btn-ghost"
                        style={{ height: "24px", padding: "0 8px", fontSize: "0.7rem", color: "#f87171" }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>



                <h3 style={{ marginTop: "9px", fontSize: "0.98rem", fontWeight: 850, lineHeight: 1.35 }}>
                  {task.title}
                </h3>

                <MemberTaskFlow personal={false} task={task} team={team} />

                {!isPostTask && task.parentCommentBody && (
                  <p
                    style={{
                      marginTop: "8px",
                      color: "var(--text-muted)",
                      fontSize: "0.76rem",
                      lineHeight: 1.55,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    Reply context: {task.parentCommentBody}
                  </p>
                )}

                <p
                  style={{
                    marginTop: "10px",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.82rem",
                    lineHeight: 1.65,
                    color: "var(--text-secondary)",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {task.body}
                </p>

                <p
                  style={{
                    marginTop: "9px",
                    color: postLinkReady ? "var(--green)" : "var(--text-muted)",
                    fontSize: "0.74rem",
                    fontWeight: 850,
                  }}
                >
                  {postLinkReady ? "tla7" : "Waiting for Reddit post link."}
                </p>
              </article>
            );
          })}
        </TaskGrid>
      )}
    </section>
  );
}

export function TaskSection({
  copiedLinkId, emptyText, onCompletePostTask, onCopyLink, onPostProofChange,
  onStatusChange, postProofDrafts, tasks, team, title, tone = "active",
}: {
  copiedLinkId: string | null;
  emptyText: string;
  onCompletePostTask: (task: AssignedTask, publishedUrl: string) => void;
  onCopyLink: (id: string, url?: string) => void | Promise<void>;
  onPostProofChange: (postId: string, value: string) => void;
  onStatusChange: (task: AssignedTask, status: Status) => void;
  postProofDrafts: Record<string, string>;
  tasks: AssignedTask[];
  team: TeamMember[];
  title: string;
  tone?: "active" | "done";
  currentUser: TeamMember;
  onDeleteTask: (task: AssignedTask) => void;
}) {
  const isDoneSection = tone === "done";

  return (
    <section className={isDoneSection ? "task-section-free is-done-section" : "task-section-free"}>
      {!isDoneSection && (
        <div className="task-section-heading">
          <div>
            <h2 style={{ fontWeight: 850, fontSize: "0.98rem" }}>{title}</h2>
            <p style={{ marginTop: "2px", color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 700 }}>
              Finish these cards first. No guessing, one clear button per task.
            </p>
          </div>
          <span
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              padding: "3px 11px",
              fontSize: "0.75rem",
              fontWeight: 850,
              color: tasks.length > 0 ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {tasks.length}
          </span>
        </div>
      )}

      {tasks.length === 0 ? (
        <div style={{ padding: isDoneSection ? "24px" : "30px", textAlign: "center" }}>
          <span style={{ fontSize: "1.8rem" }}>✓</span>
          <p
            style={{
              marginTop: "8px",
              fontSize: "0.84rem",
              color: "var(--text-muted)",
              fontWeight: 700,
            }}
          >
            {emptyText}
          </p>
        </div>
      ) : (
        <TaskGrid ariaLabel={`${title} task cards`}>
          {tasks.map((task) => {
            const proofValue = postProofDrafts[task.postId] ?? task.publishedUrl ?? "";
            const proofReady = isUsableRedditLink(proofValue);
            const postLinkReady = isUsableRedditLink(task.publishedUrl);
            const isDone = isClosedStatus(task.status);
            const isPostTask = task.kind === "post";
            const commentCopyId = `${task.id}:comment`;

            return (
              <article
                key={task.id}
                className={`task-kind-${task.kind} member-task-card ${isDone ? "is-done" : ""}`}
              >
                {/* ── Header: avatar left, subreddit+status right ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                  <TeamMemberChip compact memberId={task.assigneeId} team={team} />
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    <span style={{
                      fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)",
                      background: "var(--accent-dim)", borderRadius: "6px", padding: "2px 7px",
                    }}>
                      {getSubredditName(task.subredditUrl)}
                    </span>
                    <StatusPill status={task.status} />
                  </div>
                </div>

                {/* ── Title ── */}
                <h3 style={{
                  marginTop: "12px",
                  fontSize: "0.96rem",
                  fontWeight: 850,
                  lineHeight: 1.4,
                  color: "var(--text-primary)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {task.title}
                </h3>

                {/* ── Reply-under context (comment tasks only) ── */}
                {!isPostTask && task.parentCommentBody && (
                  <p style={{
                    marginTop: "8px",
                    fontSize: "0.73rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.4,
                    borderLeft: "2px solid var(--yellow)",
                    paddingLeft: "8px",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {task.parentCommentBody}
                  </p>
                )}

                {/* ── Task body text ── */}
                <p style={{
                  marginTop: "8px",
                  fontSize: "0.82rem",
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {task.body}
                </p>
                
                {/* ── Media Attachment ── */}
                {task.mediaUrl && (
                  <div style={{ marginTop: "10px" }}>
                    <a
                      href={task.mediaUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="btn-dark"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        textDecoration: "none"
                      }}
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Media
                    </a>
                  </div>
                )}

                {/* ── Action panel ── */}
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  {isPostTask ? (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        value={proofValue}
                        onChange={(e) => onPostProofChange(task.postId, e.target.value)}
                        placeholder="Paste Reddit post link…"
                        className="input"
                        disabled={isDone}
                        style={{ height: "36px", fontSize: "0.8rem", flex: "1 1 0", minWidth: 0 }}
                      />
                      {!isDone ? (
                        <button
                          type="button"
                          onClick={() => onCompletePostTask(task, proofValue)}
                          disabled={!proofReady}
                          className="btn-primary"
                          style={{ height: "36px", padding: "0 14px", borderRadius: "8px", whiteSpace: "nowrap", flexShrink: 0, fontSize: "0.8rem" }}
                        >
                          Done ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStatusChange(task, "queued")}
                          className="btn-ghost"
                          style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.78rem", flexShrink: 0 }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  ) : task.isAiDraft && !postLinkReady ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                        style={{ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        {copiedLinkId === commentCopyId ? "✓ Copied" : "Copy comment"}
                      </button>
                      <span style={{ color: "var(--yellow)", fontSize: "0.75rem", fontWeight: 800 }}>⏳ Waiting for post</span>
                    </div>
                  ) : postLinkReady && task.publishedUrl ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <a href={task.publishedUrl} target="_blank" rel="noreferrer" className="btn-dark"
                        style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center" }}>
                        ↗ tla7
                      </a>
                      <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                        style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        {copiedLinkId === commentCopyId ? "✓ Copied" : "Copy"}
                      </button>
                      {!isDone && (
                        <button type="button" onClick={() => onStatusChange(task, "done")} className="btn-primary"
                          style={{ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                          Done ✓
                        </button>
                      )}
                      {isDone && (
                        <button type="button" onClick={() => onStatusChange(task, "queued")} className="btn-ghost"
                          style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.78rem" }}>
                          Undo
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--yellow)", fontSize: "0.78rem", fontWeight: 800 }}>⏳ Waiting for post link</span>
                  )}

                  {/* Problem links — tiny, unobtrusive, bottom right */}
                  {!isDone && (
                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button type="button" onClick={() => onStatusChange(task, "rejected")}
                        style={{ background: "none", border: "none", color: "#f87171", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", padding: 0, opacity: 0.7 }}>
                        Rejected
                      </button>
                      <button type="button" onClick={() => onStatusChange(task, "removed")}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", padding: 0, opacity: 0.7 }}>
                        Removed
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </TaskGrid>
      )}
    </section>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          marginBottom: "5px",
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
