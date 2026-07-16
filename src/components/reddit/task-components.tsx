"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// User-facing task copy is Moroccan Darija in Latin transliteration; preserve this voice in new controls.
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

type DropdownPlacement = "bottom" | "top";

function useDropdownMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return { isOpen, ref, setIsOpen };
}

export function TeamMemberPicker({
  ariaLabel,
  fallbackToAdmin = true,
  height = 42,
  menuPlacement = "bottom",
  onChange,
  placeholder = "Khtar chi wa7ed mn team",
  style,
  team,
  value,
}: {
  ariaLabel: string;
  fallbackToAdmin?: boolean;
  height?: number;
  menuPlacement?: DropdownPlacement;
  onChange: (memberId: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  team: TeamMember[];
  value: string;
}) {
  const { isOpen, ref, setIsOpen } = useDropdownMenu();
  const selectedMember = fallbackToAdmin
    ? getAssignedMember(team, value)
    : team.find((member) => member.id === value);
  const selectedValue = selectedMember?.id ?? value;
  const selectedIndex = selectedMember ? team.findIndex((member) => member.id === selectedMember.id) : 0;
  const avatarSize = height <= 34 ? 22 : 28;
  const menuOffset = "calc(100% + 6px)";

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0, ...style }}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setIsOpen((open) => !open)}
        style={{
          width: "100%",
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "4px 10px 4px 5px",
          background: isOpen ? "var(--bg-card-hover)" : "var(--bg-card)",
          border: `1px solid ${isOpen ? "var(--accent)" : "var(--border-bright)"}`,
          borderRadius: "8px",
          color: "var(--text-primary)",
          cursor: "pointer",
          boxShadow: isOpen ? "0 0 0 3px var(--accent-dim)" : "none",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          {selectedMember ? (
            <Avatar member={selectedMember} size={avatarSize} index={selectedIndex} />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: "50%",
                border: "1px dashed var(--border-bright)",
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: height <= 34 ? "0.76rem" : "0.82rem",
              fontWeight: 800,
              color: selectedMember ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {selectedMember?.name ?? placeholder}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: isOpen ? "var(--accent)" : "var(--text-muted)", fontSize: "0.78rem", fontWeight: 900, flexShrink: 0 }}>
          {isOpen ? "^" : "v"}
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(menuPlacement === "top" ? { bottom: menuOffset } : { top: menuOffset }),
            zIndex: 80,
            minWidth: "220px",
            maxWidth: "min(320px, calc(100vw - 40px))",
            maxHeight: "280px",
            overflowY: "auto",
            padding: "6px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-bright)",
            borderRadius: "10px",
            boxShadow: "0 14px 34px rgba(0,0,0,0.46)",
          }}
        >
          {team.map((member, index) => {
            const isSelected = member.id === selectedValue;
            return (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(member.id);
                  setIsOpen(false);
                }}
                style={{
                  width: "100%",
                  minHeight: "48px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "7px 8px",
                  border: "none",
                  borderRadius: "7px",
                  background: isSelected ? "var(--accent-dim)" : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(event) => {
                  if (!isSelected) event.currentTarget.style.background = "var(--bg-card-hover)";
                }}
                onMouseLeave={(event) => {
                  if (!isSelected) event.currentTarget.style.background = "transparent";
                }}
              >
                <Avatar member={member} size={32} index={index} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.82rem", fontWeight: 850 }}>
                    {member.name}
                  </span>
                  <span style={{ display: "block", marginTop: "1px", color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 700 }}>
                    {member.isAdmin ? "L'admin" : "3odw f team"}
                  </span>
                </span>
                {isSelected && <span aria-hidden="true" style={{ color: "var(--accent)", fontWeight: 900 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const statusPickerColors: Record<Status, string> = {
  queued: "#ff7043",
  working: "#fbbf24",
  done: "#4ade80",
  rejected: "#f87171",
  removed: "#94a3b8",
  cancelled: "#94a3b8",
};

export function StatusPicker({
  ariaLabel,
  height = 42,
  menuPlacement = "bottom",
  onChange,
  style,
  value,
}: {
  ariaLabel: string;
  height?: number;
  menuPlacement?: DropdownPlacement;
  onChange: (status: Status) => void;
  style?: React.CSSProperties;
  value: Status;
}) {
  const { isOpen, ref, setIsOpen } = useDropdownMenu();
  const menuOffset = "calc(100% + 6px)";

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0, ...style }}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setIsOpen((open) => !open)}
        style={{
          width: "100%",
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          padding: "4px 9px",
          background: isOpen ? "var(--bg-card-hover)" : "var(--bg-card)",
          border: `1px solid ${isOpen ? "var(--accent)" : "var(--border-bright)"}`,
          borderRadius: "8px",
          cursor: "pointer",
          boxShadow: isOpen ? "0 0 0 3px var(--accent-dim)" : "none",
        }}
      >
        <StatusPill status={value} />
        <span aria-hidden="true" style={{ color: isOpen ? "var(--accent)" : "var(--text-muted)", fontSize: "0.78rem", fontWeight: 900, flexShrink: 0 }}>
          {isOpen ? "^" : "v"}
        </span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(menuPlacement === "top" ? { bottom: menuOffset } : { top: menuOffset }),
            zIndex: 80,
            minWidth: "180px",
            padding: "6px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-bright)",
            borderRadius: "10px",
            boxShadow: "0 14px 34px rgba(0,0,0,0.46)",
          }}
        >
          {Object.entries(statusLabels).map(([status, label]) => {
            const statusValue = status as Status;
            const isSelected = statusValue === value;
            return (
              <button
                key={statusValue}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(statusValue);
                  setIsOpen(false);
                }}
                style={{
                  width: "100%",
                  minHeight: "36px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: "7px",
                  background: isSelected ? "var(--bg-card-hover)" : "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                }}
                onMouseEnter={(event) => {
                  if (!isSelected) event.currentTarget.style.background = "var(--bg-card-hover)";
                }}
                onMouseLeave={(event) => {
                  if (!isSelected) event.currentTarget.style.background = "transparent";
                }}
              >
                <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusPickerColors[statusValue], flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                {isSelected && <span aria-hidden="true" style={{ color: "var(--accent)", fontWeight: 900 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PostCard
═══════════════════════════════════════════════════════════════ */
export function TaskDetailsModal({
  post,
  team,
  commentDraft,
  commentDrafts,
  openReplyComposerIds,
  onCommentDraftChange,
  onCreateComment,
  onDeleteComment,
  onDeletePost,
  onUpdatePost,
  onUpdateComment,
  onToggleReply,
  onClose,
}: {
  post: RedditPost;
  team: TeamMember[];
  commentDraft: CommentDraft;
  commentDrafts: Record<string, CommentDraft>;
  openReplyComposerIds: Record<string, boolean>;
  onCommentDraftChange: (key: string, value: CommentDraft) => void;
  onCreateComment: (postId: string, parentId?: string | null) => boolean | Promise<boolean>;
  onDeleteComment: (commentId: string) => void | Promise<void>;
  onDeletePost: (postId: string) => void | Promise<void>;
  onUpdatePost: (postId: string, changes: Partial<RedditPost>) => void;
  onUpdateComment: (postId: string, commentId: string, changes: Partial<RedditComment>) => void;
  onToggleReply: (commentId: string) => void;
  onClose: () => void;
}) {
  const [showControls, setShowControls] = useState(true);
  const [isRootComposerOpen, setIsRootComposerOpen] = useState(false);

  const finishedComments = post.comments.filter((c) => c.status === "done").length;
  const totalComments = post.comments.length;
  const activeComments = post.comments.filter((c) => isOpenStatus(c.status)).length;
  const rootComments = getChildComments(post.comments);
  const postLinkReady = isUsableRedditLink(post.publishedUrl);

  const expandedCommentProgressText =
    totalComments > 0 ? `${finishedComments}/${totalComments} ta3li9 salaw` : "0 ta3li9";
  const commentTone =
    totalComments > 0 && activeComments === 0
      ? "var(--green)"
      : totalComments > 0
        ? "var(--yellow)"
        : "var(--text-muted)";

  const rootCommentDraftReady = commentDraft.body.trim().length > 0 && Boolean(commentDraft.assigneeId);

  async function submitRootComment() {
    if (!rootCommentDraftReady) return false;
    const created = await onCreateComment(post.id);
    if (created) setIsRootComposerOpen(false);
    return created;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`modal-title-${post.id}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        cursor: "default",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "800px",
          maxHeight: "90vh",
          background: "var(--bg-card)",
          border: "1px solid var(--border-bright)",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <TeamMemberChip memberId={post.assigneeId} team={team} />
            <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent)" }}>
              {getSubredditName(post.subredditUrl)}
            </span>
            <StatusPill status={post.status} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            style={{
              height: "32px",
              width: "32px",
              borderRadius: "50%",
              padding: 0,
              display: "grid",
              placeItems: "center",
              fontSize: "1.1rem",
              cursor: "pointer",
            }}
            aria-label="Sedd tafasil"
          >
            X
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px" }}>
          <h3
            id={`modal-title-${post.id}`}
            style={{
              fontSize: "1.25rem",
              fontWeight: 900,
              lineHeight: 1.35,
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            {post.title}
          </h3>

          {/* Post body */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Nass dyal lpost
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
                  7ell subreddit
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
                  7ell lpost f Reddit
                </a>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700, alignSelf: "center" }}>
                  Mazal ma kaynch link dyal lpost f Reddit.
                </span>
              )}
            </div>
          </div>

          {/* Assignment flow */}
          <div style={{ marginBottom: "20px" }}>
            <AssignmentFlow post={post} team={team} />
          </div>

          {/* Admin task controls */}
          <div style={{ marginBottom: "20px" }}>
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
              <span aria-hidden="true">{showControls ? "v" : ">"}</span>
              T7akkum f l&apos;maham
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
                <TeamMemberPicker
                  value={post.assigneeId}
                  onChange={(assigneeId) => onUpdatePost(post.id, { assigneeId })}
                  height={38}
                  ariaLabel="Li m3ayyen lpost"
                  team={team}
                />
                <StatusPicker
                  value={post.status}
                  onChange={(status) => onUpdatePost(post.id, { status })}
                  height={38}
                  ariaLabel="7alat lpost"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Bghiti tlghi had lpost?")) void onDeletePost(post.id);
                  }}
                  title="Lghi had lpost"
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
                  Lghi lmahma
                </button>
                <input
                  value={post.publishedUrl ?? ""}
                  onChange={(e) => onUpdatePost(post.id, { publishedUrl: e.target.value })}
                  placeholder="Link nihai dyal lpost f Reddit"
                  className="input"
                  style={{ height: "38px", fontSize: "0.82rem", gridColumn: "1 / -1" }}
                />
              </div>
            )}
          </div>

          {/* Comments section */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
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
                  Ta3ali9
                  <span style={{ marginLeft: "8px", fontSize: "0.75rem", fontWeight: 800, color: commentTone }}>
                    {expandedCommentProgressText}
                  </span>
                </h4>
                <p style={{ marginTop: "3px", color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 700 }}>
                  3ayyen ta3ali9. Rroud kayjiw b7al thread dyal Reddit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRootComposerOpen((value) => !value)}
                className={isRootComposerOpen ? "btn-ghost" : "btn-primary"}
                style={{ height: "32px", padding: "0 12px", fontSize: "0.76rem", flexShrink: 0 }}
              >
                {isRootComposerOpen ? "Btel" : "+ Zid ta3li9"}
              </button>
            </div>

            {isRootComposerOpen && (
              <div style={{ marginBottom: "12px" }}>
                <CommentComposer
                  assigneeId={commentDraft.assigneeId}
                  body={commentDraft.body}
                  buttonLabel="Sawb ta3li9"
                  isAiDraft={commentDraft.isAiDraft}
                  onAiDraftChange={(isAiDraft) =>
                    onCommentDraftChange(post.id, { ...commentDraft, isAiDraft })
                  }
                  onAssigneeChange={(assigneeId) =>
                    onCommentDraftChange(post.id, { ...commentDraft, assigneeId })
                  }
                  onBodyChange={(body) => onCommentDraftChange(post.id, { ...commentDraft, body })}
                  onSubmit={submitRootComment}
                  placeholder="Lsa9 nass dyal tta3li9"
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
                  Mazal ma kayn ta3li9.
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
                      onDeleteComment={onDeleteComment}
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

        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            background: "var(--bg-elevated)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            style={{ height: "36px", padding: "0 18px", fontSize: "0.8rem" }}
          >
            Sedd
          </button>
        </div>
      </div>
    </div>
  );
}

export function PostCard({
  post, team, commentDraft, commentDrafts, openReplyComposerIds,
  onCommentDraftChange, onCreateComment, onDeleteComment, onDeletePost, onUpdatePost, onUpdateComment, onToggleReply,
}: {
  post: RedditPost;
  team: TeamMember[];
  commentDraft: CommentDraft;
  commentDrafts: Record<string, CommentDraft>;
  openReplyComposerIds: Record<string, boolean>;
  onCommentDraftChange: (key: string, value: CommentDraft) => void;
  onCreateComment: (postId: string, parentId?: string | null) => boolean | Promise<boolean>;
  onDeleteComment: (commentId: string) => void | Promise<void>;
  onDeletePost: (postId: string) => void | Promise<void>;
  onUpdatePost: (postId: string, changes: Partial<RedditPost>) => void;
  onUpdateComment: (postId: string, commentId: string, changes: Partial<RedditComment>) => void;
  onToggleReply: (commentId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalComments = post.comments.length;
  const activeComments = post.comments.filter((c) => isOpenStatus(c.status)).length;
  const openComments = activeComments;
  const postLinkReady = isUsableRedditLink(post.publishedUrl);
  const commentProgressText =
    totalComments === 0
      ? "0 ta3li9"
      : activeComments === 0
        ? "Ga3 tta3ali9 salaw"
        : `${activeComments} ta3li9 khddam`;
  const commentTone =
    totalComments > 0 && openComments === 0
      ? "var(--green)"
      : totalComments > 0
        ? "var(--yellow)"
        : "var(--text-muted)";
  const glowClass = getStatusGlowClass(post.softDeleted ? "cancelled" : post.status);

  function toggleExpanded() {
    setIsExpanded((value) => !value);
  }

  return (
    <>
      <article
        className={`${glowClass} task-card-clickable`}
        onClick={toggleExpanded}
        style={{
          width: "100%",
          borderRadius: "14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-bright)",
          overflow: "hidden",
        }}
      >
        {/* Collapsed header */}
        <div style={{ padding: "16px 18px" }}>
          {/* Row 1: Avatar+Name (left) ↔ Subreddit+Status (right) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <TeamMemberChip memberId={post.assigneeId} team={team} />
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent)" }}>
                {getSubredditName(post.subredditUrl)}
              </span>
              <StatusPill status={post.status} />
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
              {postLinkReady ? "✓ Lpost tla3" : "⏳ Kantssnaw link"}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.73rem", fontWeight: 700 }}>
              {timeAgo(post.createdAt)}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded(true);
              }}
              className="btn-ghost"
              style={{ marginLeft: "auto", padding: "4px 9px", fontSize: "0.72rem", fontWeight: 800 }}
              aria-label={`T7akkum f lmahma: ${post.title}`}
            >
              T7akkum
            </button>
          </div>
        </div>
      </article>

      {isExpanded && createPortal(
        <TaskDetailsModal
          post={post}
          team={team}
          commentDraft={commentDraft}
          commentDrafts={commentDrafts}
          openReplyComposerIds={openReplyComposerIds}
          onCommentDraftChange={onCommentDraftChange}
          onCreateComment={onCreateComment}
          onDeleteComment={onDeleteComment}
          onDeletePost={onDeletePost}
          onUpdatePost={onUpdatePost}
          onUpdateComment={onUpdateComment}
          onToggleReply={onToggleReply}
          onClose={toggleExpanded}
        />,
        document.body
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components (unchanged visual design)
═══════════════════════════════════════════════════════════════ */
export function TopNav({
  currentUser, currentUserIndex, notifications, pendingCount, onLogout, team,
  searchQuery = "", onSearchChange,
}: {
  currentUser: TeamMember;
  currentUserIndex: number;
  notifications: ActivityLogItem[];
  pendingCount: number;
  onLogout: () => void;
  team: TeamMember[];
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
}) {
  return (
    <nav
      className="top-nav"
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
      <div className="top-nav-identity" style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
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
            alt="Logo dyal Reddit"
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
          className="top-nav-user"
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
          <span className="top-nav-user-name" style={{ fontSize: "0.82rem", fontWeight: 700 }}>{currentUser.name}</span>
        </div>
      </div>

      {onSearchChange && (
        <div className="top-nav-search" style={{ flex: 1, minWidth: 0, maxWidth: "480px", margin: "0 24px" }}>
          <div style={{ position: "relative" }}>
            <svg
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "16px",
                height: "16px",
                color: "var(--text-muted)",
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Qelleb f l3onwan, tta3li9, subreddit, wla chi wa7ed..."
              className="input"
              style={{
                height: "36px",
                paddingLeft: "36px",
                fontSize: "0.82rem",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-bright)",
                borderRadius: "20px",
                width: "100%",
              }}
            />
          </div>
        </div>
      )}

      <div className="top-nav-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <NotificationBell count={pendingCount} notifications={notifications} team={team} />
        <button
          onClick={onLogout}
          className="btn-ghost top-nav-logout"
          style={{ fontSize: "0.75rem", padding: "6px 14px" }}
        >
          Khrj
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

function getAssignedMember(team: TeamMember[], memberId: string) {
  return team.find((member) => member.id === memberId) ?? team.find((member) => member.isAdmin) ?? team[0];
}

function TaskParentContext({ task }: { task: AssignedTask }) {
  if (task.kind === "post") {
    return (
      <>
        <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 850, textTransform: "uppercase" }}>
          Mahma dyal lpost
        </p>
        <h3
          style={{
            marginTop: "6px",
            fontSize: "0.96rem",
            fontWeight: 850,
            lineHeight: 1.4,
            color: "var(--text-primary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {task.title}
        </h3>
      </>
    );
  }

  const isReply = Boolean(task.parentCommentId);

  return (
    <div
      style={{
        borderLeft: "3px solid var(--indigo)",
        paddingLeft: "10px",
      }}
    >
      <p style={{ color: "var(--indigo)", fontSize: "0.7rem", fontWeight: 850, textTransform: "uppercase" }}>
        {isReply ? "Mahma dyal rradd" : "Mahma dyal tta3li9"}
      </p>
      <p style={{ marginTop: "5px", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 800 }}>
        {isReply ? "Katjaweb t7t had lpost" : "Ktob had tta3li9 f had lpost"}
      </p>
      <h3
        title={task.title}
        style={{
          marginTop: "4px",
          fontSize: "0.96rem",
          fontWeight: 850,
          lineHeight: 1.4,
          color: "var(--text-primary)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {task.title}
      </h3>
      <p style={{ marginTop: "4px", color: "var(--accent)", fontSize: "0.72rem", fontWeight: 800 }}>
        {getSubredditName(task.subredditUrl)}
      </p>
      {task.parentCommentBody && (
        <p
          style={{
            marginTop: "8px",
            color: "var(--text-muted)",
            fontSize: "0.73rem",
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          Jawab 3la: {task.parentCommentBody}
        </p>
      )}
    </div>
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
  const member = getAssignedMember(team, memberId);
  const memberIndex = member ? team.findIndex((candidate) => candidate.id === member.id) : -1;
  const colorIndex = memberIndex >= 0 ? memberIndex : 0;
  const name = member?.name ?? "Makhass 7ed";

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
      {member && (
        <Avatar
          member={member}
          size={compact ? 32 : 36}
          fontSize={compact ? "0.8rem" : "0.9rem"}
          index={colorIndex}
        />
      )}
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
    working: { label: "khddam 3liha", bg: "rgba(234,179,8,0.12)", color: "#fbbf24" },
    done: { label: "salat", bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
    rejected: { label: "trfd", bg: "rgba(248,113,113,0.12)", color: "#f87171" },
    removed: { label: "t7ydat", bg: "rgba(148,163,184,0.14)", color: "#94a3b8" },
    cancelled: { label: "tlgat", bg: "rgba(148,163,184,0.14)", color: "#94a3b8" },
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
      Draft b AI
    </span>
  );
}

export function AssignmentFlow({ post, team }: { post: RedditPost; team: TeamMember[] }) {
  const commentAssigneeIds = getCommentAssigneeIds(post.comments);
  const finishedComments = post.comments.filter((c) => c.status === "done").length;
  const totalComments = post.comments.length;
  const postLinkReady = isUsableRedditLink(post.publishedUrl);
  const commentAssignees =
    totalComments > 0 ? getAssigneeList(team, commentAssigneeIds) : "Zid ta3ali9 m3ayynin";
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
        Masar dyal ta3yin
      </p>
      <div className="assignment-flow-strip" style={{ marginTop: "8px" }}>
        <div className="assignment-flow-item">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ color: "var(--text-primary)", fontSize: "0.8rem", fontWeight: 850 }}>
              1. Lpost + l3onwan
            </span>
            <StatusPill status={post.status} />
          </div>
          <div style={{ marginTop: "8px" }}>
            <TeamMemberChip compact memberId={post.assigneeId} team={team} />
          </div>
          <p style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.73rem", lineHeight: 1.45 }}>
            {postLinkReady ? "Link nihai dyal Reddit wajed." : "Had ssid mazal khaso ylsa9 link dyal lpost f Reddit."}
          </p>
        </div>

        <span className="post-flow-arrow" aria-hidden="true">→</span>

        <div className="assignment-flow-item">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <span style={{ color: "var(--text-primary)", fontSize: "0.8rem", fontWeight: 850 }}>
              2. Ta3ali9
            </span>
            <span
              style={{
                color: commentsReady ? "var(--green)" : totalComments > 0 ? "var(--yellow)" : "var(--text-muted)",
                fontSize: "0.74rem",
                fontWeight: 850,
                whiteSpace: "nowrap",
              }}
            >
              {totalComments > 0 ? `${finishedComments}/${totalComments} salaw` : "0 m3ayyen"}
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
            {postLinkReady ? "Li m3ayynin ltta3ali9 y9dro y7ello lpost w ykhdmo." : "Khdma dyal tta3li9 katsna link dyal lpost."}
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
  const postPerson = isPostTask && personal ? "nta" : getMemberName(team, task.postAssigneeId);
  const commentPerson =
    !isPostTask && personal
      ? "nta"
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
      aria-label="Tartib dyal lmahma"
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
        Lpost · {postPerson}
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
        {isPostTask ? "Ta3ali9" : personal ? "Tta3li9 dyalk" : "Ta3li9"} · {commentPerson}
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
        aria-label={hasPending ? `${count} lmaham mazal. 7ell log dyal team.` : "7ell log dyal team."}
        title={hasPending ? `${count} lmaham mazal` : "Log dyal team"}
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
          aria-label="Log dyal tahdithat team"
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
              <p style={{ fontSize: "0.88rem", fontWeight: 900 }}>Log dyal team</p>
              <p style={{ marginTop: "2px", color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 750 }}>
                Ga3 team t9der tchof tta3yin, links, w lkhadma li salat.
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
              {notifications.length} tahdit
            </span>
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "22px", textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 800 }}>
                Mazal ma kayn ta7dit f team.
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
                      {item.kind === "post" ? "Lpost" : item.kind === "comment" ? "Ta3li9" : "Nidam"} · {timeAgo(item.createdAt)}
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
      <TeamMemberPicker
        value={assigneeId}
        onChange={onAssigneeChange}
        fallbackToAdmin={false}
        height={38}
        menuPlacement="top"
        ariaLabel="Li ghaykhdem 3la tta3li9"
        style={{ alignSelf: "end" }}
        team={team}
      />
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
        Draft b AI
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
  onCreateReply, onDeleteComment, onDraftChange, onToggleReply, onUpdateComment, postLinkReady, team,
}: {
  comment: RedditComment;
  comments: RedditComment[];
  getDraft: (parentId: string) => CommentDraft;
  isReplyOpen: (commentId: string) => boolean;
  level: number;
  onCreateReply: (parentId: string) => boolean | Promise<boolean>;
  onDeleteComment: (commentId: string) => void | Promise<void>;
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
                {level === 0 ? "Ta3li9" : `Radd lmostawa ${level}`}
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
              <TeamMemberPicker
                value={comment.assigneeId}
                onChange={(assigneeId) => onUpdateComment(comment.id, { assigneeId })}
                height={32}
                menuPlacement="top"
                style={{ flex: 1 }}
                ariaLabel={`Li m3ayyen ltta3li9 dyal ${getMemberName(team, comment.assigneeId)}`}
                team={team}
              />
              <StatusPicker
                value={comment.status}
                onChange={(status) => onUpdateComment(comment.id, { status })}
                height={32}
                menuPlacement="top"
                style={{ flex: 1 }}
                ariaLabel="7alat tta3li9"
              />
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
                {postLinkReady ? "tla3" : "Kantssnaw link dyal lpost"}
              </span>
              {childComments.length > 0 && (
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 800 }}>
                  {hiddenReplyCount} rroud
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
                {replyOpen ? "Btel" : "Rodd"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Bghiti tmse7 had tta3li9?")) void onDeleteComment(comment.id);
                }}
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  background: "transparent",
                  border: "none",
                  color: "#f87171",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                Mse7
              </button>
            </div>
          </div>
        </div>

        {replyOpen && (
          <div style={{ margin: "8px 0 8px" }}>
            <CommentComposer
              assigneeId={draft.assigneeId}
              body={draft.body}
              buttonLabel="Rodd"
              isAiDraft={draft.isAiDraft}
              onAiDraftChange={(isAiDraft) =>
                onDraftChange(comment.id, { ...draft, isAiDraft })
              }
              onAssigneeChange={(assigneeId) =>
                onDraftChange(comment.id, { ...draft, assigneeId })
              }
              onBodyChange={(body) => onDraftChange(comment.id, { ...draft, body })}
              onSubmit={() => onCreateReply(comment.id)}
              placeholder="Ktob rradd 3la had tta3li9"
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
              ? "Khbbi rroud"
              : `Bayyen ${hiddenReplyCount} rroud`}
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
                onDeleteComment={onDeleteComment}
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
          <h2 style={{ fontWeight: 850, fontSize: "0.98rem" }}>L&apos;maham dyal team kamlin</h2>
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
        <TaskGrid ariaLabel="Kartat lmaham dyal team kamlin">
          {tasks.map((task) => {
            const isPostTask = task.kind === "post";
            const isClosed = isClosedStatus(task.status);
            const postLinkReady = isUsableRedditLink(task.publishedUrl);

            return (
              <article
                key={`${task.kind}:${task.id}`}
                className={`${getStatusGlowClass(task.status)} task-kind-${task.kind} member-task-card ${isClosed ? "is-done" : ""}`}
              >
                {/* ── Hero avatar header ── */}
                <div style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "flex-start",
                  marginBottom: "14px",
                  paddingBottom: "14px",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {/* Large avatar with status ring */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 96,
                      height: 96,
                      borderRadius: "50%",
                      padding: "3px",
                      background: isClosedStatus(task.status)
                        ? "linear-gradient(135deg, #4ade80, #22c55e)"
                        : task.status === "working"
                          ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
                          : "linear-gradient(135deg, #ff7043, #ff4500)",
                      boxShadow: isClosedStatus(task.status)
                        ? "0 0 16px rgba(74,222,128,0.35)"
                        : task.status === "working"
                          ? "0 0 16px rgba(251,191,36,0.35)"
                          : "0 0 16px rgba(255,69,0,0.35)",
                    }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: "var(--bg-base)" }}>
                        {(() => {
                          const member = getAssignedMember(team, task.assigneeId);
                          const memberIndex = member ? team.findIndex((candidate) => candidate.id === member.id) : -1;
                          return member ? <Avatar member={member} size={90} fontSize="2rem" index={memberIndex >= 0 ? memberIndex : 0} /> : null;
                        })()}
                      </div>
                    </div>
                    {/* Kind badge */}
                    <span style={{
                      position: "absolute",
                      bottom: 2,
                      right: 2,
                      background: isPostTask ? "var(--accent)" : "#6c63ff",
                      color: "#fff",
                      fontSize: "0.6rem",
                      fontWeight: 900,
                      borderRadius: "999px",
                      padding: "2px 6px",
                      border: "2px solid var(--bg-card)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}>
                      {isPostTask ? "Lpost" : task.parentCommentId ? "Radd" : "Ta3li9"}
                    </span>
                  </div>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const member = getAssignedMember(team, task.assigneeId);
                      const memberIndex = member ? team.findIndex((candidate) => candidate.id === member.id) : -1;
                      return (
                        <p style={{ fontSize: "1.05rem", fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.2 }}>
                          {member?.name ?? "—"}
                          {memberIndex === 0 && <span style={{ marginLeft: "6px", fontSize: "0.7rem", color: "var(--accent)", fontWeight: 700 }}>★</span>}
                        </p>
                      );
                    })()}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px", alignItems: "center" }}>
                      <span style={{
                        fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)",
                        background: "var(--accent-dim)", borderRadius: "6px", padding: "2px 7px",
                      }}>
                        {getSubredditName(task.subredditUrl)}
                      </span>
                      <StatusPill status={task.status} />
                    </div>
                    {currentUser.isAdmin && (
                      <button
                        type="button"
                        onClick={() => { if (confirm("Bghiti tmse7 had lmahma?")) onDeleteTask(task); }}
                        className="btn-ghost"
                        style={{ marginTop: "6px", height: "22px", padding: "0 8px", fontSize: "0.68rem", color: "#f87171" }}
                      >
                        🗑 Mse7
                      </button>
                    )}
                  </div>
                </div>

                <TaskParentContext task={task} />

                <MemberTaskFlow personal={false} task={task} team={team} />

                <p style={{ marginTop: "12px", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 850, textTransform: "uppercase" }}>
                  {isPostTask ? "Tafasil dyal lpost" : "Ta3li9 khass ytla3"}
                </p>

                <p
                  style={{
                    marginTop: "6px",
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
                  {postLinkReady ? "tla3" : "Kantssnaw link dyal lpost f Reddit."}
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
              Kmmel had lmaham lwlin. Kol mahma 3andha zrr wade7.
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
        <TaskGrid ariaLabel={`Kartat lmaham dyal ${title}`}>
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
                {/* ── Hero avatar header ── */}
                <div style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "flex-start",
                  marginBottom: "14px",
                  paddingBottom: "14px",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {/* Large avatar with status ring */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 96,
                      height: 96,
                      borderRadius: "50%",
                      padding: "3px",
                      background: isDone
                        ? "linear-gradient(135deg, #4ade80, #22c55e)"
                        : task.status === "working"
                          ? "linear-gradient(135deg, #fbbf24, #f59e0b)"
                          : "linear-gradient(135deg, #ff7043, #ff4500)",
                      boxShadow: isDone
                        ? "0 0 16px rgba(74,222,128,0.35)"
                        : task.status === "working"
                          ? "0 0 16px rgba(251,191,36,0.35)"
                          : "0 0 16px rgba(255,69,0,0.35)",
                    }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: "var(--bg-base)" }}>
                        {(() => {
                          const member = getAssignedMember(team, task.assigneeId);
                          const memberIndex = member ? team.findIndex((candidate) => candidate.id === member.id) : -1;
                          return member ? <Avatar member={member} size={90} fontSize="2rem" index={memberIndex >= 0 ? memberIndex : 0} /> : null;
                        })()}
                      </div>
                    </div>
                    {/* Kind badge */}
                    <span style={{
                      position: "absolute",
                      bottom: 2,
                      right: 2,
                      background: isPostTask ? "var(--accent)" : "#6c63ff",
                      color: "#fff",
                      fontSize: "0.6rem",
                      fontWeight: 900,
                      borderRadius: "999px",
                      padding: "2px 6px",
                      border: "2px solid var(--bg-card)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}>
                      {isPostTask ? "Lpost" : task.parentCommentId ? "Radd" : "Ta3li9"}
                    </span>
                  </div>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(() => {
                      const member = getAssignedMember(team, task.assigneeId);
                      const memberIndex = member ? team.findIndex((candidate) => candidate.id === member.id) : -1;
                      return (
                        <p style={{ fontSize: "1.05rem", fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.2 }}>
                          {member?.name ?? "—"}
                          {memberIndex === 0 && <span style={{ marginLeft: "6px", fontSize: "0.7rem", color: "var(--accent)", fontWeight: 700 }}>★</span>}
                        </p>
                      );
                    })()}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "7px", alignItems: "center" }}>
                      <span style={{
                        fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)",
                        background: "var(--accent-dim)", borderRadius: "6px", padding: "2px 7px",
                      }}>
                        {getSubredditName(task.subredditUrl)}
                      </span>
                      <StatusPill status={task.status} />
                    </div>
                  </div>
                </div>

                <TaskParentContext task={task} />

                <p style={{ marginTop: "12px", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 850, textTransform: "uppercase" }}>
                  {isPostTask ? "Tafasil dyal lpost" : "Ta3li9 khass ytla3"}
                </p>
                <p style={{
                  marginTop: "6px",
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
                      Hbbet lmedia
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
                        placeholder="Lsa9 link dyal lpost f Reddit..."
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
                          Salat ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStatusChange(task, "queued")}
                          className="btn-ghost"
                          style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.78rem", flexShrink: 0 }}
                        >
                          Rje3
                        </button>
                      )}
                    </div>
                  ) : task.isAiDraft && !postLinkReady ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                        style={{ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        {copiedLinkId === commentCopyId ? "✓ Tnssakh" : "Nssakh tta3li9"}
                      </button>
                      <span style={{ color: "var(--yellow)", fontSize: "0.75rem", fontWeight: 800 }}>⏳ Kantssnaw lpost</span>
                    </div>
                  ) : postLinkReady && task.publishedUrl ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <a href={task.publishedUrl} target="_blank" rel="noreferrer" className="btn-dark"
                        style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center" }}>
                        ↗ tla7
                      </a>
                      <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                        style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        {copiedLinkId === commentCopyId ? "✓ Tnssakh" : "Nssakh"}
                      </button>
                      {!isDone && (
                        <button type="button" onClick={() => onStatusChange(task, "done")} className="btn-primary"
                          style={{ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                          Salat ✓
                        </button>
                      )}
                      {isDone && (
                        <button type="button" onClick={() => onStatusChange(task, "queued")} className="btn-ghost"
                          style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.78rem" }}>
                          Rje3
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--yellow)", fontSize: "0.78rem", fontWeight: 800 }}>⏳ Kantssnaw link dyal lpost</span>
                  )}

                  {/* Problem links — tiny, unobtrusive, bottom right */}
                  {!isDone && (
                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button type="button" onClick={() => onStatusChange(task, "rejected")}
                        style={{ background: "none", border: "none", color: "#f87171", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", padding: 0, opacity: 0.7 }}>
                        Trfd
                      </button>
                      <button type="button" onClick={() => onStatusChange(task, "removed")}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", padding: 0, opacity: 0.7 }}>
                        T7ydat
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
