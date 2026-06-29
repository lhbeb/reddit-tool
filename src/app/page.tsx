"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import {
  Field,
  MetricCard,
  MetricPill,
  PostCard,
  TaskSection,
  TeamTimelineSection,
  TopNav,
  Avatar,
} from "@/components/reddit/task-components";
import {
  formatSupabaseError,
  isMissingColumnError,
} from "@/lib/db/errors";
import { loadRedditPosts } from "@/lib/db/posts";
import { loadTeamMembers } from "@/lib/db/team";
import {
  getCommentAssigneeIds,
  getCommentDraftKey,
  getMemberName,
  getSubredditName,
  isClosedStatus,
  isOpenStatus,
  isPostActive,
  isSoftDeletedPost,
  isScopeFilter,
  isSortMode,
  isStatusFilter,
  isUsableRedditLink,
  sortLabels,
  statusLabels,
} from "@/lib/helpers";
import { supabase } from "@/lib/supabase";
import type {
  ActivityLogItem,
  AssignedTask,
  CommentDraft,
  RedditComment,
  RedditPost,
  ScopeFilter,
  SortMode,
  Status,
  StatusFilter,
  TeamMember,
} from "@/lib/types";

/* ─── Constants ──────────────────────────────────────────────── */
const SESSION_KEY = "reddit-assignment-session-v2"; // v2 = slug-based
const ADMIN_FILTER_PREFS_KEY = "reddit-assignment-admin-filters-v1";
const LOCAL_PASSWORD = "Localserver!!2";
/* ═══════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════ */
export default function Home() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [loginDraft, setLoginDraft] = useState({ slug: "mehdi", password: "" });
  const [loginError, setLoginError] = useState("");
  const [activeAssignee, setActiveAssignee] = useState("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("active");
  const [activeScope, setActiveScope] = useState<ScopeFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFiltersReady, setAdminFiltersReady] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postDraft, setPostDraft] = useState({
    title: "", postBody: "", subredditUrl: "", assigneeId: "",
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [postError, setPostError] = useState("");
  const [isAssignDropdownOpen, setIsAssignDropdownOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, CommentDraft>>({});
  const [postProofDrafts, setPostProofDrafts] = useState<Record<string, string>>({});
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [openReplyComposerIds, setOpenReplyComposerIds] = useState<Record<string, boolean>>({});
  const [memberTab, setMemberTab] = useState<"my-tasks" | "team-tasks">("my-tasks");
  const [teamFilterAssignee, setTeamFilterAssignee] = useState<string>("all");

  /* ── Load team from DB ─────────────────────────────────────── */
  const loadTeam = useCallback(async () => {
    const loadedTeam = await loadTeamMembers();
    setTeam(loadedTeam);
    return loadedTeam;
  }, []);

  /* ── Load posts + nested comments from DB ──────────────────── */
  const loadPosts = useCallback(async () => {
    const loadedPosts = await loadRedditPosts();
    setPosts(loadedPosts);
  }, []);

  /* ── Bootstrap: team, session, posts ──────────────────────── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const loadedTeam = await loadTeam();
      await loadPosts();

      // Restore session
      const savedSlug = window.localStorage.getItem(SESSION_KEY);
      const found = savedSlug ? loadedTeam.find((m) => m.slug === savedSlug) : null;
      if (found) {
        setCurrentUser(found);
        // Admins see ALL posts by default; members see only their own
        setActiveAssignee(found.isAdmin ? "all" : found.id);
        // Seed the post-form assignee to a real UUID
        setPostDraft((cur) => ({ ...cur, assigneeId: found.id }));
      } else if (loadedTeam.length > 0) {
        // No session yet — default form assignee to first team member
        setPostDraft((cur) => ({ ...cur, assigneeId: loadedTeam[0].id }));
      }

      setLoading(false);
    })();
  }, [loadTeam, loadPosts]);

  /* ── Real-time subscription ────────────────────────────────── */
  useEffect(() => {
    const channel = supabase
      .channel("reddit-desk-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reddit_posts" },
        () => { loadPosts(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reddit_comments" },
        () => { loadPosts(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members" },
        () => { loadTeam(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadPosts, loadTeam]);

  useEffect(() => {
    if (!currentUser?.isAdmin || adminFiltersReady || team.length === 0) return;

    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(ADMIN_FILTER_PREFS_KEY);
        if (raw) {
          const prefs = JSON.parse(raw) as Partial<{
            activeAssignee: string;
            activeScope: ScopeFilter;
            activeStatus: StatusFilter;
            searchQuery: string;
            sortMode: SortMode;
          }>;

          if (typeof prefs.searchQuery === "string") setSearchQuery(prefs.searchQuery);
          if (isStatusFilter(prefs.activeStatus)) setActiveStatus(prefs.activeStatus);
          if (isScopeFilter(prefs.activeScope)) setActiveScope(prefs.activeScope);
          if (isSortMode(prefs.sortMode)) setSortMode(prefs.sortMode);

          const savedAssignee = prefs.activeAssignee;
          if (
            savedAssignee === "all" ||
            (typeof savedAssignee === "string" && team.some((member) => member.id === savedAssignee))
          ) {
            setActiveAssignee(savedAssignee);
          }
        }
      } catch {
        window.localStorage.removeItem(ADMIN_FILTER_PREFS_KEY);
      } finally {
        setAdminFiltersReady(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [adminFiltersReady, currentUser?.isAdmin, team]);
  useEffect(() => {
    if (!currentUser?.isAdmin || !adminFiltersReady) return;

    window.localStorage.setItem(
      ADMIN_FILTER_PREFS_KEY,
      JSON.stringify({ activeAssignee, activeScope, activeStatus, searchQuery, sortMode }),
    );
  }, [activeAssignee, activeScope, activeStatus, adminFiltersReady, currentUser?.isAdmin, searchQuery, sortMode]);

  /* ── Derived ────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const activePosts = posts.filter((post) => !isSoftDeletedPost(post));
    const comments = activePosts.flatMap((p) => p.comments);
    return {
      posts: activePosts.length,
      comments: comments.length,
      withComments: activePosts.filter((post) => post.comments.length > 0).length,
      queued:
        activePosts.filter((p) => p.status === "queued").length +
        comments.filter((c) => c.status === "queued").length,
      done:
        activePosts.filter((p) => p.status === "done").length +
        comments.filter((c) => c.status === "done").length,
    };
  }, [posts]);

  const assignedTasks = useMemo<AssignedTask[]>(() => {
    if (!currentUser) return [];
    return posts.flatMap((post) => {
      const commentAssigneeIds = getCommentAssigneeIds(post.comments);
      const assignedPost =
        post.assigneeId === currentUser.id
          ? [
              {
                id: post.id,
                kind: "post" as const,
                title: post.title,
                body: post.postBody,
                subredditUrl: post.subredditUrl,
                publishedUrl: post.publishedUrl,
                assigneeId: post.assigneeId,
                postAssigneeId: post.assigneeId,
                commentAssigneeIds,
                status: post.softDeleted ? "cancelled" : post.status,
                createdAt: post.createdAt,
                postId: post.id,
                postSoftDeleted: post.softDeleted,
              },
            ]
          : [];

      const assignedComments = post.comments
        .filter((c) => c.assigneeId === currentUser.id)
        .map((c) => {
          const parentComment = c.parentId
            ? post.comments.find((comment) => comment.id === c.parentId)
            : null;

          return {
            id: c.id,
            kind: "comment" as const,
            title: post.title,
            body: c.body,
            subredditUrl: post.subredditUrl,
            publishedUrl: post.publishedUrl,
            assigneeId: c.assigneeId,
            postAssigneeId: post.assigneeId,
            commentAssigneeIds,
            status: post.softDeleted ? "cancelled" : c.status,
            createdAt: c.createdAt,
            postId: post.id,
            postSoftDeleted: post.softDeleted,
            isAiDraft: c.isAiDraft,
            postedUrl: c.postedUrl,
            parentCommentId: c.parentId ?? null,
            parentCommentBody: parentComment?.body ?? null,
            commentId: c.id,
          };
        });

      return [...assignedPost, ...assignedComments];
    });
  }, [currentUser, posts]);

  const pendingTasks = useMemo(
    () => assignedTasks.filter((t) => !t.postSoftDeleted && isOpenStatus(t.status)),
    [assignedTasks],
  );
  const doneTasks = useMemo(
    () => assignedTasks.filter((t) => t.postSoftDeleted || isClosedStatus(t.status)),
    [assignedTasks],
  );
  const pendingTaskCount = pendingTasks.length;
  const memberPendingTasks = useMemo(
    () =>
      [...pendingTasks].sort((a, b) => {
        const actionRank = (task: AssignedTask) => {
          if (task.kind === "post") return 0;
          return isUsableRedditLink(task.publishedUrl) ? 1 : 2;
        };
        const rankDiff = actionRank(a) - actionRank(b);
        if (rankDiff !== 0) return rankDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [pendingTasks],
  );
  const recentDoneTasks = useMemo(
    () =>
      [...doneTasks].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [doneTasks],
  );
  const allTeamTasks = useMemo<AssignedTask[]>(
    () =>
      posts.flatMap((post) => {
        const commentAssigneeIds = getCommentAssigneeIds(post.comments);
        const mediaMatch = post.postBody.match(/\[MEDIA:(.+?)\]/);
        const mediaUrl = mediaMatch ? mediaMatch[1] : undefined;
        const cleanBody = post.postBody.replace(/\[MEDIA:.+?\]/, '').trim();

        const postTask: AssignedTask = {
          id: post.id,
          kind: "post",
          title: post.title,
          body: cleanBody,
          mediaUrl,
          subredditUrl: post.subredditUrl,
          publishedUrl: post.publishedUrl,
          assigneeId: post.assigneeId,
          postAssigneeId: post.assigneeId,
          commentAssigneeIds,
          status: post.softDeleted ? "cancelled" : post.status,
          createdAt: post.createdAt,
          postId: post.id,
          postSoftDeleted: post.softDeleted,
        };

        const commentTasks = post.comments.map((comment) => {
          const parentComment = comment.parentId
            ? post.comments.find((candidate) => candidate.id === comment.parentId)
            : null;

          return {
            id: comment.id,
            kind: "comment" as const,
            title: post.title,
            body: comment.body,
            subredditUrl: post.subredditUrl,
            publishedUrl: post.publishedUrl,
            assigneeId: comment.assigneeId,
            postAssigneeId: post.assigneeId,
            commentAssigneeIds,
            status: post.softDeleted ? "cancelled" : comment.status,
            createdAt: comment.createdAt,
            postId: post.id,
            postSoftDeleted: post.softDeleted,
            isAiDraft: comment.isAiDraft,
            postedUrl: comment.postedUrl,
            parentCommentId: comment.parentId ?? null,
            parentCommentBody: parentComment?.body ?? null,
            commentId: comment.id,
          };
        });

        return [postTask, ...commentTasks];
      }),
    [posts],
  );
  const filteredTeamTasks = useMemo(
    () =>
      allTeamTasks
        .filter((task) => teamFilterAssignee === "all" || task.assigneeId === teamFilterAssignee)
        .sort((a, b) => {
          const closedDiff = Number(isClosedStatus(a.status)) - Number(isClosedStatus(b.status));
          if (closedDiff !== 0) return closedDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
    [allTeamTasks, teamFilterAssignee],
  );

  const activityLog = useMemo<ActivityLogItem[]>(() => {
    const closedActionLabels: Partial<Record<Status, string>> = {
      done: "completed",
      rejected: "reported rejected",
      removed: "reported removed",
      cancelled: "cancelled",
    };
    const toneByStatus: Partial<Record<Status, ActivityLogItem["tone"]>> = {
      done: "green",
      rejected: "red",
      removed: "muted",
      cancelled: "muted",
      working: "yellow",
      queued: "accent",
    };

    const getActor = (memberId: string) => getMemberName(team, memberId);
    const items: ActivityLogItem[] = [];

    posts.forEach((post) => {
      const postAssignee = getActor(post.assigneeId);
      const postTime = post.assignedAt ?? post.createdAt;
      const subreddit = getSubredditName(post.subredditUrl);

      items.push({
        id: `post-assigned-${post.id}`,
        actorId: post.assigneeId,
        actorName: postAssignee,
        action: post.status === "working" ? "started a post task" : "was assigned a post task",
        createdAt: postTime,
        detail: post.title,
        kind: "post",
        subreddit,
        tone: post.status === "working" ? "yellow" : "accent",
      });

      if (post.publishedUrl) {
        items.push({
          id: `post-link-${post.id}`,
          actorId: post.assigneeId,
          actorName: postAssignee,
          action: "tla7",
          createdAt: postTime,
          detail: post.title,
          kind: "post",
          subreddit,
          tone: "green",
        });
      }

      if (isClosedStatus(post.status)) {
        const actorId = post.deletedBy ?? post.assigneeId;
        items.push({
          id: `post-status-${post.id}-${post.status}`,
          actorId,
          actorName: getActor(actorId),
          action: `${closedActionLabels[post.status] ?? "updated"} a post task`,
          createdAt: post.deletedAt ?? postTime,
          detail: post.title,
          kind: "post",
          subreddit,
          tone: toneByStatus[post.status] ?? "muted",
        });
      }

      post.comments.forEach((comment) => {
        const commentAssignee = getActor(comment.assigneeId);
        const commentTime = comment.assignedAt ?? comment.createdAt;
        const commentDetail = comment.body.length > 96
          ? `${comment.body.slice(0, 96)}...`
          : comment.body;

        items.push({
          id: `comment-assigned-${comment.id}`,
          actorId: comment.assigneeId,
          actorName: commentAssignee,
          action: comment.parentId ? "was assigned a reply task" : "was assigned a comment task",
          createdAt: commentTime,
          detail: commentDetail,
          kind: "comment",
          subreddit,
          tone: "yellow",
        });

        if (isClosedStatus(comment.status)) {
          items.push({
            id: `comment-status-${comment.id}-${comment.status}`,
            actorId: comment.assigneeId,
            actorName: commentAssignee,
            action: `${closedActionLabels[comment.status] ?? "updated"} a comment task`,
            createdAt: commentTime,
            detail: commentDetail,
            kind: "comment",
            subreddit,
            tone: toneByStatus[comment.status] ?? "muted",
          });
        }
      });
    });

    return items
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60);
  }, [posts, team]);

  const filteredPosts = useMemo(
    () => {
      const normalizedSearch = searchQuery.trim().toLowerCase();
      const matchingPosts = posts.filter((post) => {
        const includeSoftDeleted = activeStatus === "all" || activeStatus === "cancelled";
        if (isSoftDeletedPost(post) && !includeSoftDeleted) return false;

        const scopeMatch = activeScope === "all" || post.comments.length > 0;
        const assigneeMatch =
          activeAssignee === "all" ||
          post.assigneeId === activeAssignee ||
          post.comments.some((c) => c.assigneeId === activeAssignee);
        const statusMatch =
          activeStatus === "all"
            ? true
            : activeStatus === "active"
              ? isPostActive(post)
              : post.status === activeStatus ||
                post.comments.some((c) => c.status === activeStatus);
        const searchMatch =
          !normalizedSearch ||
          [
            post.title,
            post.postBody,
            post.subredditUrl,
            getSubredditName(post.subredditUrl),
            getMemberName(team, post.assigneeId),
            ...post.comments.flatMap((comment) => [
              comment.body,
              getMemberName(team, comment.assigneeId),
            ]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);

        return scopeMatch && assigneeMatch && statusMatch && searchMatch;
      });

      return matchingPosts.sort((a, b) => {
        if (sortMode === "oldest") {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }

        if (sortMode === "assignee") {
          const assigneeDiff = getMemberName(team, a.assigneeId).localeCompare(
            getMemberName(team, b.assigneeId),
          );
          if (assigneeDiff !== 0) return assigneeDiff;
        }

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    },
    [activeAssignee, activeScope, activeStatus, posts, searchQuery, sortMode, team],
  );

  const filterSummaryText = useMemo(() => {
    const parts = [sortLabels[sortMode]];
    if (activeStatus !== "active") {
      parts.push(activeStatus === "all" ? "all statuses" : statusLabels[activeStatus].toLowerCase());
    }
    if (activeScope === "with-comments") parts.push("with comments");
    if (activeAssignee !== "all") parts.push(getMemberName(team, activeAssignee));
    if (searchQuery.trim()) parts.push(`matching "${searchQuery.trim()}"`);
    return parts.join(" - ");
  }, [activeAssignee, activeScope, activeStatus, searchQuery, sortMode, team]);

  const emptyState = useMemo(() => {
    if (posts.length === 0) {
      return {
        title: "No assignments yet",
        body: "Create the first Reddit post from the New post button.",
      };
    }

    if (searchQuery.trim()) {
      return {
        title: "Nothing matches that search",
        body: `No title, comment, subreddit, or person matches "${searchQuery.trim()}". Clear search to see the queue again.`,
      };
    }

    if (activeScope === "with-comments") {
      return {
        title: "No posts with comments here",
        body: "Switch Show back to All posts or add a comment assignment to a post.",
      };
    }

    if (activeAssignee !== "all") {
      return {
        title: `No tasks for ${getMemberName(team, activeAssignee)}`,
        body: "Pick All people or choose another teammate.",
      };
    }

    return {
      title: "No matching assignments",
      body: activeStatus === "active"
        ? "Everything visible is done or closed. Switch status to All statuses or create a new post."
        : "Try another status filter or reset the filters.",
    };
  }, [activeAssignee, activeScope, activeStatus, posts.length, searchQuery, team]);
  /* ── Handlers ─────────────────────────────────────────────── */
  function resetAdminFilters() {
    setSearchQuery("");
    setActiveAssignee("all");
    setActiveStatus("active");
    setActiveScope("all");
    setSortMode("newest");
  }

  function applyMetricFilter(metric: "posts" | "comments" | "queued" | "done") {
    setSearchQuery("");
    setActiveAssignee("all");
    setSortMode("newest");

    if (metric === "posts") {
      setActiveScope("all");
      setActiveStatus("all");
      return;
    }

    if (metric === "comments") {
      setActiveScope("with-comments");
      setActiveStatus("all");
      return;
    }

    setActiveScope("all");
    setActiveStatus(metric);
  }
  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginDraft.password !== LOCAL_PASSWORD) {
      setLoginError("Wrong password. Try again.");
      return;
    }
    const found = team.find((m) => m.slug === loginDraft.slug);
    if (!found) { setLoginError("Member not found."); return; }
    setCurrentUser(found);
    // Admins see ALL posts; members see only their own
    setActiveAssignee(found.isAdmin ? "all" : found.id);
    setPostDraft((cur) => ({ ...cur, assigneeId: found.id }));
    setLoginError("");
    if (found.isAdmin) setAdminFiltersReady(false);
    window.localStorage.setItem(SESSION_KEY, found.slug);
  }

  function handleLogout() {
    setCurrentUser(null);
    setActiveAssignee("all");
    setAdminFiltersReady(false);
    window.localStorage.removeItem(SESSION_KEY);
  }

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPostError("");
    if (!postDraft.title.trim() || !postDraft.postBody.trim()) return;

    // Always resolve to a real UUID — never pass an empty string to a UUID FK column
    const assigneeId = postDraft.assigneeId || team[0]?.id;
    if (!assigneeId) { setPostError("Team not loaded yet — try again."); return; }

    setIsSubmittingPost(true);
    try {
      let finalBody = postDraft.postBody.trim();

      if (mediaFile) {
        const formData = new FormData();
        formData.append("file", mediaFile);
        try {
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (data.success && data.url) {
            finalBody += `\n\n[MEDIA:${data.url}]`;
          }
        } catch (err) {
          console.error("Failed to upload media:", err);
        }
      }

      const insertPayload: Record<string, string | null> = {
        title: postDraft.title.trim(),
        post_body: finalBody,
        subreddit_url: postDraft.subredditUrl.trim() || null,
        assignee_id: assigneeId,
        status: "queued",
      };
      if (currentUser?.id) insertPayload.created_by_id = currentUser.id;

      const pendingPayload = { ...insertPayload };
      let response = await supabase
        .from("reddit_posts")
        .insert(pendingPayload)
        .select()
        .single();

      while (response.error && isMissingColumnError(response.error, "created_by_id")) {
        delete pendingPayload.created_by_id;
        response = await supabase
          .from("reddit_posts")
          .insert(pendingPayload)
          .select()
          .single();
      }

      const { data, error } = response;

      if (error) {
        const message = formatSupabaseError(error);
        console.error("[create-post] Supabase error:", message);
        setPostError(`Failed to save: ${message}`);
        return;
      }

      if (data) {
        console.log("[create-post] Inserted:", data.id);
        setPostDraft({ title: "", postBody: "", subredditUrl: "", assigneeId });
        // Ensure admin filter shows all so the new post is visible
        setActiveAssignee("all");
        setActiveStatus("active");
        setActiveScope("all");
        setSortMode("newest");
        setIsCreatePostOpen(false);
        await loadPosts();
      }
    } finally {
      setIsSubmittingPost(false);
    }
  }

  async function handleCreateComment(postId: string, parentId?: string | null) {
    const draftKey = getCommentDraftKey(postId, parentId);
    const draft = commentDrafts[draftKey];
    if (!draft?.body.trim()) return false;

    const insertPayload: Record<string, string | boolean> = {
      post_id: postId,
      body: draft.body.trim(),
      assignee_id: draft.assigneeId,
      status: "queued",
      is_ai_draft: draft.isAiDraft,
    };
    if (parentId) insertPayload.parent_id = parentId;
    if (currentUser?.id) insertPayload.created_by_id = currentUser.id;

    const fallbackColumns = ["parent_id", "created_by_id", "is_ai_draft"];
    const pendingPayload = { ...insertPayload };
    let { error } = await supabase.from("reddit_comments").insert(pendingPayload);

    while (error) {
      const missingColumn = fallbackColumns.find(
        (column) => column in pendingPayload && isMissingColumnError(error, column),
      );
      if (!missingColumn) break;

      delete pendingPayload[missingColumn];
      ({ error } = await supabase.from("reddit_comments").insert(pendingPayload));
    }

    if (error) {
      console.error("[create-comment]", formatSupabaseError(error));
      return false;
    }

    setCommentDrafts((cur) => ({
      ...cur,
      [draftKey]: { body: "", assigneeId: draft.assigneeId, isAiDraft: draft.isAiDraft },
    }));
    await loadPosts();
    return true;
  }
  async function updatePost(postId: string, changes: Partial<RedditPost>) {
    const existingPost = posts.find((post) => post.id === postId);
    const dbChanges: Record<string, unknown> = {};
    if (changes.assigneeId !== undefined) dbChanges.assignee_id = changes.assigneeId;
    if (changes.status !== undefined)     dbChanges.status = changes.status;
    if (changes.publishedUrl !== undefined) dbChanges.published_url = changes.publishedUrl;
    if (changes.softDeleted !== undefined) dbChanges.soft_deleted = changes.softDeleted;
    if (changes.deletedAt !== undefined) dbChanges.deleted_at = changes.deletedAt;
    if (changes.deletedBy !== undefined) dbChanges.deleted_by = changes.deletedBy;
    if (changes.rejectionReason !== undefined) dbChanges.rejection_reason = changes.rejectionReason;
    if (changes.assignedAt !== undefined) dbChanges.assigned_at = changes.assignedAt;
    if (
      changes.assigneeId !== undefined &&
      changes.assigneeId !== existingPost?.assigneeId &&
      changes.assignedAt === undefined
    ) {
      dbChanges.assigned_at = new Date().toISOString();
    }

    const fallbackColumns = [
      "published_url",
      "soft_deleted",
      "deleted_at",
      "deleted_by",
      "rejection_reason",
      "assigned_at",
    ];
    const pendingChanges = { ...dbChanges };
    let { error } = await supabase.from("reddit_posts").update(pendingChanges).eq("id", postId);

    while (error) {
      const missingColumn = fallbackColumns.find(
        (column) => column in pendingChanges && isMissingColumnError(error, column),
      );
      if (!missingColumn) break;

      delete pendingChanges[missingColumn];
      if (Object.keys(pendingChanges).length === 0) {
        error = null;
        break;
      }

      ({ error } = await supabase.from("reddit_posts").update(pendingChanges).eq("id", postId));
    }

    if (error) {
      console.error("[update-post]", formatSupabaseError(error));
      return;
    }
    await loadPosts();
  }

  async function updateComment(
    _postId: string,
    commentId: string,
    changes: Partial<RedditComment>,
  ) {
    const dbChanges: Record<string, unknown> = {};
    if (changes.assigneeId !== undefined) dbChanges.assignee_id = changes.assigneeId;
    if (changes.status !== undefined)     dbChanges.status = changes.status;
    if (changes.postedUrl !== undefined) dbChanges.posted_url = changes.postedUrl;
    if (changes.assignedAt !== undefined) dbChanges.assigned_at = changes.assignedAt;
    const existingComment = posts
      .flatMap((post) => post.comments)
      .find((comment) => comment.id === commentId);
    if (
      changes.assigneeId !== undefined &&
      changes.assigneeId !== existingComment?.assigneeId &&
      changes.assignedAt === undefined
    ) {
      dbChanges.assigned_at = new Date().toISOString();
    }

    const fallbackColumns = ["posted_url", "assigned_at"];
    const pendingChanges = { ...dbChanges };
    let { error } = await supabase.from("reddit_comments").update(pendingChanges).eq("id", commentId);

    while (error) {
      const missingColumn = fallbackColumns.find(
        (column) => column in pendingChanges && isMissingColumnError(error, column),
      );
      if (!missingColumn) break;

      delete pendingChanges[missingColumn];
      if (Object.keys(pendingChanges).length === 0) {
        error = null;
        break;
      }

      ({ error } = await supabase.from("reddit_comments").update(pendingChanges).eq("id", commentId));
    }
    if (error) {
      console.error("[update-comment]", formatSupabaseError(error));
      return;
    }
    await loadPosts();
  }



  async function deleteTask(task: AssignedTask) {
    if (!currentUser?.isAdmin) return;
    if (task.kind === "post") {
      await deletePost(task.postId);
    } else if (task.commentId) {
      const { error } = await supabase.from("reddit_comments").delete().eq("id", task.commentId);
      if (error) {
        showToast("Error deleting task: " + error.message);
      } else {
        showToast("Task deleted");
        await loadPosts();
      }
    }
  }

  async function updateAssignedTaskStatus(task: AssignedTask, status: Status) {
    if (task.kind === "post") {
      await updatePost(task.postId, { status });
    } else if (task.commentId) {
      await updateComment(task.postId, task.commentId, { status });
    }
  }

  async function completePostTask(task: AssignedTask, publishedUrl: string) {
    const clean = publishedUrl.trim();
    if (!isUsableRedditLink(clean) || task.kind !== "post") return;
    await updatePost(task.postId, { publishedUrl: clean, status: "done" });
    showToast("Post task marked as done!");
    setPostProofDrafts((cur) => ({ ...cur, [task.postId]: clean }));
  }

  async function copyLinkToClipboard(id: string, url?: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    window.setTimeout(() => setCopiedLinkId(null), 1500);
  }

  async function deletePost(postId: string) {
    await updatePost(postId, {
      status: "cancelled",
      softDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser?.id ?? null,
      rejectionReason: "Cancelled by admin",
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ team, posts }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reddit-assignments.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleTeamNameChange(id: string, name: string) {
    setTeam((cur) => cur.map((m) => (m.id === id ? { ...m, name } : m)));
    await supabase.from("team_members").update({ display_name: name }).eq("id", id);
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center mesh-bg">
        <div className="flex flex-col items-center gap-4 fade-up">
          <div
            className="h-10 w-10 rounded-full border-2 border-transparent spin"
            style={{
              borderTopColor: "var(--accent)",
              borderRightColor: "rgba(255,69,0,0.3)",
            }}
          />
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.78rem",
              fontWeight: 700,
              letterSpacing: 0,
              textTransform: "uppercase",
            }}
          >
            Loading assignment desk
          </p>
        </div>
      </main>
    );
  }

  /* ── Login ─────────────────────────────────────────────────── */
  if (!currentUser) {
    return (
      <main className="grid min-h-screen place-items-center mesh-bg px-5 py-10">
        <div className="w-full max-w-md fade-up">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div
              style={{
                background: "rgba(255,69,0,0.12)",
                border: "1px solid rgba(255,69,0,0.25)",
                borderRadius: "16px",
                padding: "14px 20px",
              }}
            >
              <Image
                src="/reddit-1.svg"
                alt="Reddit logo"
                width={120}
                height={40}
                priority
                className="h-8 w-auto"
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(38%) sepia(99%) saturate(700%) hue-rotate(353deg) brightness(100%) contrast(102%)",
                }}
              />
            </div>
            <div style={{ textAlign: "center" }}>
              <h1
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 900,
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                }}
              >
                Assignment Desk
              </h1>
              <p style={{ marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Sign in to access your tasks
              </p>
            </div>
          </div>

          <div className="glass-card" style={{ padding: "28px" }}>
            <form
              onSubmit={handleLogin}
              style={{ display: "flex", flexDirection: "column", gap: "18px" }}
            >
              <Field label="Who are you?">
                <select
                  value={loginDraft.slug}
                  onChange={(e) =>
                    setLoginDraft((cur) => ({ ...cur, slug: e.target.value }))
                  }
                  className="input"
                  style={{ height: "44px" }}
                >
                  {team.map((m) => (
                    <option key={m.id} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Password">
                <input
                  value={loginDraft.password}
                  onChange={(e) =>
                    setLoginDraft((cur) => ({ ...cur, password: e.target.value }))
                  }
                  type="password"
                  placeholder="Enter team password"
                  className="input"
                  style={{ height: "44px" }}
                />
              </Field>

              {loginError && (
                <div
                  style={{
                    background: "rgba(255,69,0,0.1)",
                    border: "1px solid rgba(255,69,0,0.25)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                  }}
                >
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ff7043" }}>
                    {loginError}
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                style={{ height: "46px", fontSize: "0.9rem", marginTop: "4px" }}
              >
                Open dashboard →
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const isAdmin = currentUser.isAdmin;
  const currentUserIndex = team.findIndex((m) => m.id === currentUser.id);

  /* ── Member View ─────────────────────────────────────────── */
  if (!isAdmin) {
    const nextTaskText =
      pendingTasks.length === 0
        ? "No pending work"
        : `${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} to finish`;

    return (
      <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <TopNav
          currentUser={currentUser}
          currentUserIndex={currentUserIndex}
          notifications={activityLog}
          pendingCount={pendingTaskCount}
          onLogout={handleLogout}
          team={team}
        />

        <section
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            padding: "22px 0",
          }}
        >
          <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "0 20px" }}>
            <div className="member-hero-row">
              <div style={{ minWidth: 0 }}>
                <p style={{ color: "var(--accent)", fontSize: "0.76rem", fontWeight: 850 }}>
                  {nextTaskText}
                </p>
                <h1 style={{ marginTop: "5px", fontSize: "1.22rem", fontWeight: 900, lineHeight: 1.25 }}>
                  Your tasks
                </h1>
                <p style={{ marginTop: "5px", color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: 1.55 }}>
                  Open the first card, do the work on Reddit, then come back and press Mark done.
                </p>
              </div>
              <div className="member-count-strip" aria-label="Task summary">
                <MetricPill label="To do" value={pendingTasks.length} tone="accent" />
                <MetricPill label="Done" value={doneTasks.length} tone="green" />
              </div>
            </div>
          </div>
        </section>

        <section style={{ width: "100%", padding: "22px clamp(16px, 2vw, 28px) 34px" }}>
          <div style={{ display: "grid", gap: "18px" }}>
            <div className="member-tabs" role="tablist" aria-label="Member task views">
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === "my-tasks"}
                className={memberTab === "my-tasks" ? "is-active" : ""}
                onClick={() => setMemberTab("my-tasks")}
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                My Tasks
                <span>{pendingTasks.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === "team-tasks"}
                className={memberTab === "team-tasks" ? "is-active" : ""}
                onClick={() => setMemberTab("team-tasks")}
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                All Team Tasks
                <span>{filteredTeamTasks.length}</span>
              </button>
            </div>

            {memberTab === "my-tasks" ? (
              <>
                <TaskSection currentUser={currentUser} onDeleteTask={deleteTask}
                  copiedLinkId={copiedLinkId}
                  emptyText="Nothing to do right now. New tasks from Mehdi Admin will show up here."
                  onCompletePostTask={completePostTask}
                  onCopyLink={copyLinkToClipboard}
                  onPostProofChange={(postId, value) =>
                    setPostProofDrafts((cur) => ({ ...cur, [postId]: value }))
                  }
                  onStatusChange={updateAssignedTaskStatus}
                  postProofDrafts={postProofDrafts}
                  tasks={memberPendingTasks}
                  team={team}
                  title="JUST DO IT NOW"
                  tone="active"
                />

                <section
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowDoneTasks((value) => !value)}
                    className="done-toggle"
                    aria-expanded={showDoneTasks}
                  >
                    <span style={{ fontWeight: 850 }}>Finished tasks</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 800 }}>
                      {doneTasks.length} {showDoneTasks ? "shown" : "hidden"} {showDoneTasks ? "▴" : "▾"}
                    </span>
                  </button>

                  {showDoneTasks && (
                    <TaskSection currentUser={currentUser} onDeleteTask={deleteTask}
                      copiedLinkId={copiedLinkId}
                      emptyText="Finished tasks will appear here."
                      onCompletePostTask={completePostTask}
                      onCopyLink={copyLinkToClipboard}
                      onPostProofChange={(postId, value) =>
                        setPostProofDrafts((cur) => ({ ...cur, [postId]: value }))
                      }
                      onStatusChange={updateAssignedTaskStatus}
                      postProofDrafts={postProofDrafts}
                      tasks={recentDoneTasks}
                      team={team}
                      title="Done"
                      tone="done"
                    />
                  )}
                </section>
              </>
            ) : (
              <>
                <section
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <Field label="Filter team tasks">
                    <select
                      value={teamFilterAssignee}
                      onChange={(event) => setTeamFilterAssignee(event.target.value)}
                      className="input"
                      style={{ height: "40px", maxWidth: "280px" }}
                    >
                      <option value="all">All people</option>
                      {team.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </section>
                <TeamTimelineSection
                  emptyText="No team tasks match this filter."
                  tasks={filteredTeamTasks}
                  team={team}
                  currentUser={currentUser!}
                  onDeleteTask={deleteTask}
                />
              </>
            )}
          </div>
        </section>

        <style>{`
          .member-tabs {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 5px;
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
          }

          .member-tabs button {
            flex: 1 1 180px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--text-muted);
            border-radius: 9px;
            padding: 9px 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 0.8rem;
            font-weight: 850;
          }

          .member-tabs button.is-active {
            border-color: rgba(255,69,0,0.28);
            background: var(--accent-dim);
            color: var(--accent);
          }

          .member-tabs span {
            min-width: 22px;
            height: 22px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            background: var(--bg-elevated);
            color: var(--text-primary);
            font-size: 0.72rem;
          }

          .member-hero-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 16px;
            align-items: center;
          }

          .member-count-strip {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            justify-content: flex-end;
          }

          .metric-pill {
            min-width: 92px;
            border: 1px solid var(--border);
            border-radius: 999px;
            background: var(--bg-card);
            padding: 7px 11px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }

          .done-toggle {
            width: 100%;
            border: 0;
            background: transparent;
            color: var(--text-primary);
            padding: 13px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            text-align: left;
          }

          .task-section-free {
            display: grid;
            gap: 14px;
          }

          .task-section-heading {
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            padding: 2px 2px 0;
          }

          .task-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            align-items: start;
          }
          @media (max-width: 900px) {
            .task-grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 600px) {
            .task-grid { grid-template-columns: 1fr; }
          }

          .member-task-card {
            --task-accent: var(--accent);
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 0;
            background: var(--bg-card);
            border: 1px solid var(--border-bright);
            border-radius: 12px;
            padding: 16px;
            overflow: hidden;
            transition: border-color 150ms ease, box-shadow 150ms ease;
          }

          .member-task-card:hover {
            border-color: var(--task-accent);
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          }

          .member-task-card.task-kind-post {
            --task-accent: var(--accent);
          }

          .member-task-card.task-kind-comment {
            --task-accent: var(--yellow);
          }

          .member-task-card.is-done {
            opacity: 0.65;
          }

          .member-breadcrumb {
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
            font-size: 0.74rem;
            font-weight: 800;
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
          }

          .member-breadcrumb span,
          .member-breadcrumb strong {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .member-breadcrumb strong {
            color: var(--text-primary);
          }

          .member-task-header,




          .member-flow-dot.ready {
            background: var(--green-dim);
            color: var(--green);
          }


          .member-report-row button {
            border: 1px solid rgba(248,113,113,0.24);
            background: rgba(248,113,113,0.08);
            color: #f87171;
            border-radius: 999px;
            padding: 5px 10px;
            font-size: 0.74rem;
            font-weight: 850;
          }

          .member-report-row button:last-child {
            border-color: rgba(148,163,184,0.24);
            background: rgba(148,163,184,0.10);
            color: #94a3b8;
          }

          @media (max-width: 720px) {
            .member-hero-row {
              grid-template-columns: 1fr;
            }

            .member-count-strip {
              justify-content: flex-start;
            }

            .member-proof-row {
              grid-template-columns: 1fr;
            }

            .task-section-heading {
              padding: 0;
            }

            .task-grid {
              grid-template-columns: 1fr;
              gap: 14px;
            }

            .member-breadcrumb {
              flex-wrap: wrap;
              white-space: normal;
            }
          }
        `}</style>
      </main>
    );
  }
  /* ── Admin View ──────────────────────────────────────────── */
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <TopNav
        currentUser={currentUser}
        currentUserIndex={0}
        notifications={activityLog}
        pendingCount={pendingTaskCount}
        onLogout={handleLogout}
        team={team}
      />

      {isCreatePostOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-post-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.62)",
            display: "grid",
            placeItems: "center",
            padding: "24px",
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingPost) {
              setIsCreatePostOpen(false);
            }
          }}
        >
          <div
            className="glass-card"
            style={{
              width: "min(560px, 100%)",
              maxHeight: "min(760px, calc(100vh - 48px))",
              overflow: "auto",
              background: "var(--bg-card)",
              borderRadius: "18px",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <div>
                <h2 id="create-post-title" style={{ fontWeight: 900, fontSize: "1.1rem" }}>
                  Add Reddit post
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "3px" }}>
                  Create the post task first, then add comment assignments from the card.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatePostOpen(false)}
                disabled={isSubmittingPost}
                className="btn-ghost"
                style={{ width: "34px", height: "34px", padding: 0, borderRadius: "50%" }}
                aria-label="Close create post"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={handleCreatePost}
              style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <Field label="Title">
                <input
                  value={postDraft.title}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, title: e.target.value }))
                  }
                  placeholder="Paste the exact Reddit title"
                  className="input"
                />
              </Field>
              <Field label="Post body">
                <textarea
                  value={postDraft.postBody}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, postBody: e.target.value }))
                  }
                  placeholder="Paste the post body here"
                  className="input"
                  style={{ minHeight: "140px", resize: "vertical" }}
                />
              </Field>
              <Field label="Attach Media (optional)">
                <div style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "24px",
                  border: "2px dashed var(--border-bright)",
                  borderRadius: "12px",
                  background: mediaFile ? "var(--accent-dim)" : "var(--bg-elevated)",
                  color: mediaFile ? "var(--text-primary)" : "var(--text-muted)",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                }}>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                      cursor: "pointer",
                      zIndex: 10
                    }}
                  />
                  {mediaFile ? (
                    <>
                      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth="2" style={{ marginBottom: "8px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800 }}>{mediaFile.name}</span>
                      <span style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "4px" }}>Click to change file</span>
                    </>
                  ) : (
                    <>
                      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ marginBottom: "8px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800 }}>Click or drag file to upload</span>
                      <span style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "4px" }}>Supports images and videos</span>
                    </>
                  )}
                </div>
              </Field>
              <Field label="Subreddit link">
                <input
                  value={postDraft.subredditUrl}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, subredditUrl: e.target.value }))
                  }
                  placeholder="https://reddit.com/r/example"
                  className="input"
                />
              </Field>
              <Field label="Assign post to">
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setIsAssignDropdownOpen(!isAssignDropdownOpen)}
                    className="input"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      cursor: "pointer",
                      background: "var(--bg-elevated)",
                      textAlign: "left",
                    }}
                  >
                    {(() => {
                      const selectedMember = team.find(m => m.id === (postDraft.assigneeId || team[0]?.id)) || team[0];
                      if (!selectedMember) return "Select Assignee";
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Avatar member={selectedMember} size={24} />
                          <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                            {selectedMember.name}
                          </span>
                        </div>
                      );
                    })()}
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isAssignDropdownOpen && (
                    <>
                      <div 
                        style={{ position: "fixed", inset: 0, zIndex: 40 }} 
                        onClick={() => setIsAssignDropdownOpen(false)}
                      />
                      <ul
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 4px)", // popup upwards to avoid cutting off
                          left: 0,
                          right: 0,
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-bright)",
                          borderRadius: "10px",
                          boxShadow: "0 -8px 24px rgba(0,0,0,0.3)",
                          zIndex: 50,
                          maxHeight: "220px",
                          overflowY: "auto",
                          padding: "6px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                          listStyle: "none",
                          margin: 0
                        }}
                      >
                        {team.map((m, i) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setPostDraft((cur) => ({ ...cur, assigneeId: m.id }));
                                setIsAssignDropdownOpen(false);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                width: "100%",
                                padding: "8px 10px",
                                background: postDraft.assigneeId === m.id ? "var(--bg-elevated)" : "transparent",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "background 0.15s ease"
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                              onMouseLeave={(e) => {
                                if (postDraft.assigneeId !== m.id) e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <Avatar member={m} size={28} index={i} />
                              <span style={{ 
                                fontWeight: postDraft.assigneeId === m.id ? 700 : 500, 
                                fontSize: "0.85rem", 
                                color: postDraft.assigneeId === m.id ? "var(--text-primary)" : "var(--text-secondary)" 
                              }}>
                                {m.name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </Field>
              {postError && (
                <div style={{ background: "rgba(255,69,0,0.1)", border: "1px solid rgba(255,69,0,0.3)", borderRadius: "8px", padding: "10px 14px" }}>
                  <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#ff7043" }}>{postError}</p>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreatePostOpen(false)}
                  disabled={isSubmittingPost}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPost}
                  className="btn-primary"
                  style={{ minWidth: "112px" }}
                >
                  {isSubmittingPost ? "Saving..." : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header metrics */}
      <section
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          padding: "20px 0",
        }}
      >
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <div>
              <h1 style={{ fontSize: "1.35rem", fontWeight: 900, lineHeight: 1.2 }}>
                Assignment control
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px" }}>
                Scan active Reddit work, open one task, then assign the next step.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPostError("");
                setIsCreatePostOpen(true);
              }}
              className="btn-primary"
              style={{ padding: "10px 18px", borderRadius: "999px", whiteSpace: "nowrap" }}
            >
              + New post
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <MetricCard
              active={activeScope === "all" && activeStatus === "all"}
              accent="var(--accent)"
              hint="Show every post"
              label="Posts"
              onClick={() => applyMetricFilter("posts")}
              value={stats.posts}
            />
            <MetricCard
              active={activeScope === "with-comments"}
              accent="var(--indigo)"
              hint={`${stats.withComments} posts have comments`}
              label="Comments"
              onClick={() => applyMetricFilter("comments")}
              value={stats.comments}
            />
            <MetricCard
              active={activeStatus === "queued"}
              accent="var(--yellow)"
              hint="Waiting work"
              label="mazal"
              onClick={() => applyMetricFilter("queued")}
              value={stats.queued}
            />
            <MetricCard
              active={activeStatus === "done"}
              accent="var(--green)"
              hint="Finished work"
              label="Done"
              onClick={() => applyMetricFilter("done")}
              value={stats.done}
            />
          </div>
        </div>
      </section>

      {/* Body */}
      <section
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "24px",
          display: "grid",
          gap: "24px",
          gridTemplateColumns: "340px minmax(0,1fr)",
        }}
        className="admin-grid"
      >
        {/* Sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>Find tasks</h2>
              <p style={{ marginTop: "3px", color: "var(--text-muted)", fontSize: "0.76rem", lineHeight: 1.5 }}>
                Search first, then narrow by person or status.
              </p>
            </div>
            <div style={{ padding: "16px 18px 18px", display: "grid", gap: "12px" }}>
              <Field label="Search">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Title, comment, subreddit, person"
                  className="input"
                  style={{ height: "40px", fontSize: "0.82rem" }}
                />
              </Field>
              <Field label="Person">
                <select
                  value={activeAssignee}
                  onChange={(e) => setActiveAssignee(e.target.value)}
                  className="input"
                  style={{ height: "40px", fontSize: "0.82rem" }}
                >
                  <option value="all">All people</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Show">
                <select
                  value={activeScope}
                  onChange={(e) => setActiveScope(e.target.value as ScopeFilter)}
                  className="input"
                  style={{ height: "40px", fontSize: "0.82rem" }}
                >
                  <option value="all">All posts</option>
                  <option value="with-comments">With comments</option>
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.value as StatusFilter)}
                  className="input"
                  style={{ height: "40px", fontSize: "0.82rem" }}
                >
                  <option value="active">Active work</option>
                  <option value="all">All statuses</option>
                  {Object.entries(statusLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sort">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="input"
                  style={{ height: "40px", fontSize: "0.82rem" }}
                >
                  {Object.entries(sortLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid var(--border)",
                  paddingTop: "12px",
                  color: "var(--text-muted)",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                }}
              >
                <span>{filteredPosts.length} visible</span>
                <button
                  type="button"
                  onClick={resetAdminFilters}
                  className="btn-ghost"
                  style={{ padding: "5px 10px", fontSize: "0.72rem" }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setIsTeamPanelOpen((value) => !value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                background: "transparent",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "var(--text-primary)",
                textAlign: "left",
              }}
            >
              <span>
                <span style={{ display: "block", fontWeight: 800, fontSize: "1rem" }}>
                  Team settings
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.74rem" }}>
                  Edit names only when needed
                </span>
              </span>
              <span style={{ color: "var(--accent)", fontWeight: 900 }}>
                {isTeamPanelOpen ? "−" : "+"}
              </span>
            </button>

            {isTeamPanelOpen && (
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  padding: "12px 18px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {team.map((member, index) => (
                  <label key={member.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Avatar member={member} size={34} fontSize="0.7rem" index={index} />
                    <input
                      value={member.name}
                      onChange={(e) => handleTeamNameChange(member.id, e.target.value)}
                      className="input"
                      style={{ height: "36px", fontSize: "0.82rem" }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={exportJson}
                  className="btn-ghost"
                  style={{ marginTop: "6px", padding: "7px 12px", fontSize: "0.75rem" }}
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Queue */}
        <section style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>Assignment queue</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "2px" }}>
                {filterSummaryText}
              </p>
            </div>
            <span
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "999px",
                padding: "5px 12px",
                color: "var(--text-muted)",
                fontSize: "0.76rem",
                fontWeight: 800,
              }}
            >
              {filteredPosts.length} shown - {sortLabels[sortMode]}
            </span>
          </div>

          <div
            style={{
              minHeight: "540px",
              borderRadius: "14px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              padding: filteredPosts.length === 0 ? 0 : "14px",
            }}
          >
            {filteredPosts.length === 0 ? (
              <div
                style={{
                  minHeight: "540px",
                  display: "grid",
                  placeItems: "center",
                  padding: "40px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <span style={{ fontSize: "2rem", color: "var(--text-muted)", fontWeight: 900 }}>[]</span>
                  <h3 style={{ fontSize: "1.08rem", fontWeight: 900 }}>
                    {emptyState.title}
                  </h3>
                  <p
                    style={{
                      color: "var(--text-muted)",
                      maxWidth: "360px",
                      lineHeight: 1.6,
                      fontSize: "0.88rem",
                    }}
                  >
                    {emptyState.body}
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "14px",
                }}
              >
                {filteredPosts.map((post) => {
                  const draft = commentDrafts[post.id] ?? {
                    body: "",
                    assigneeId: team[0]?.id ?? "",
                    isAiDraft: false,
                  };
                  return (
                    <PostCard key={post.id} post={post} team={team} currentUser={currentUser!} onDeleteTask={deleteTask} onDeletePost={deletePost}
                      commentDraft={draft}
                      commentDrafts={commentDrafts}
                      openReplyComposerIds={openReplyComposerIds}
                      onCommentDraftChange={(key, value) =>
                        setCommentDrafts((cur) => ({ ...cur, [key]: value }))
                      }
                      onCreateComment={handleCreateComment}
                      onUpdatePost={updatePost}
                      onUpdateComment={updateComment}
                      onToggleReply={(commentId) =>
                        setOpenReplyComposerIds((cur) => ({
                          ...cur,
                          [commentId]: !cur[commentId],
                        }))
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </section>

      <style>{`
        .metric-card {
          text-align: left;
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }

        .metric-card:hover {
          transform: translateY(-1px);
          background: var(--bg-card-hover) !important;
        }

        .metric-card.is-active {
          box-shadow: 0 0 0 3px rgba(255,255,255,0.03);
        }
        .post-card-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .post-card-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .post-flow-strip,
        .assignment-flow-strip,
        .post-link-row {
          display: flex;
          align-items: stretch;
          gap: 8px;
          flex-wrap: wrap;
        }

        .post-flow-strip {
          margin-top: 12px;
        }

        .post-flow-card,
        .assignment-flow-item {
          flex: 1 1 230px;
          min-width: 0;
          border: 1px solid var(--border);
          background: var(--bg-elevated);
          border-radius: 10px;
          padding: 10px 12px;
        }

        .assignment-flow-item {
          background: var(--bg-card);
        }

        .post-flow-arrow {
          display: grid;
          place-items: center;
          color: var(--accent);
          font-weight: 900;
          padding: 0 2px;
        }

        .admin-controls-grid {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) 140px auto;
          gap: 8px;
          align-items: center;
        }

        @media (max-width: 900px) {
          .admin-grid { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 760px) {
          .metric-card {
          text-align: left;
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }

        .metric-card:hover {
          transform: translateY(-1px);
          background: var(--bg-card-hover) !important;
        }

        .metric-card.is-active {
          box-shadow: 0 0 0 3px rgba(255,255,255,0.03);
        }
        .post-card-summary {
            grid-template-columns: 1fr;
          }

          .post-card-actions {
            justify-content: flex-start;
          }

          .post-flow-arrow {
            width: 100%;
            justify-content: flex-start;
            padding-left: 10px;
          }

          .admin-controls-grid {
            grid-template-columns: 1fr;
          }

          .admin-controls-grid > input {
            grid-column: auto !important;
          }
        }
      `}</style>

      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          backgroundColor: "var(--foreground)",
          color: "var(--background)",
          padding: "12px 24px",
          borderRadius: "8px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
          fontWeight: 600,
          zIndex: 9999,
          animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
        }}>
          {toastMessage}
        </div>
      )}
    </main>
  );
}
