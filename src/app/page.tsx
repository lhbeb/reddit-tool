"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
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
  TeamMemberPicker,
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
// Keep all user-facing strings in Moroccan Darija, written in Latin transliteration.
const SESSION_KEY = "reddit-assignment-session-v2"; // v2 = slug-based
const ADMIN_FILTER_PREFS_KEY = "reddit-assignment-admin-filters-v1";
const ADMIN_PASSWORD = "Mehbde!!2";
const MEMBER_PASSWORD = "Localserver!!2";
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
  const [isLoginMemberDropdownOpen, setIsLoginMemberDropdownOpen] = useState(false);
  const loginMemberDropdownRef = useRef<HTMLDivElement>(null);
  const [activeAssignee, setActiveAssignee] = useState("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("active");
  const [activeScope, setActiveScope] = useState<ScopeFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFiltersReady, setAdminFiltersReady] = useState(false);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postDraft, setPostDraft] = useState({
    title: "", postBody: "", subredditUrl: "", assigneeId: "",
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [postError, setPostError] = useState("");
  const [isCreateCommentOpen, setIsCreateCommentOpen] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentModalError, setCommentModalError] = useState("");
  const [commentModalDraft, setCommentModalDraft] = useState({
    postId: "", body: "", assigneeId: "", isAiDraft: false
  });
  const [isPostDropdownOpen, setIsPostDropdownOpen] = useState(false);
  const [postSearchQuery, setPostSearchQuery] = useState("");
  const postDropdownRef = useRef<HTMLDivElement>(null);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, CommentDraft>>({});
  const [postProofDrafts, setPostProofDrafts] = useState<Record<string, string>>({});
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [openReplyComposerIds, setOpenReplyComposerIds] = useState<Record<string, boolean>>({});
  const [memberTab, setMemberTab] = useState<"my-tasks" | "team-tasks">("my-tasks");
  const [teamFilterAssignee, setTeamFilterAssignee] = useState<string>("all");
  const [isTeamFilterDropdownOpen, setIsTeamFilterDropdownOpen] = useState(false);
  const teamFilterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTeamFilterDropdownOpen) return;

    function closeMenu(event: PointerEvent) {
      if (!teamFilterDropdownRef.current?.contains(event.target as Node)) {
        setIsTeamFilterDropdownOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsTeamFilterDropdownOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isTeamFilterDropdownOpen]);

  useEffect(() => {
    if (!isLoginMemberDropdownOpen) return;

    function closeMenu(event: PointerEvent) {
      if (!loginMemberDropdownRef.current?.contains(event.target as Node)) {
        setIsLoginMemberDropdownOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsLoginMemberDropdownOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isLoginMemberDropdownOpen]);

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

  // Click outside listener for global comment creator post dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (postDropdownRef.current && !postDropdownRef.current.contains(event.target as Node)) {
        setIsPostDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
  const teamOpenTaskCounts = useMemo(() => {
    const counts = new Map(team.map((member) => [member.id, 0]));

    allTeamTasks.forEach((task) => {
      if (isOpenStatus(task.status)) {
        counts.set(task.assigneeId, (counts.get(task.assigneeId) ?? 0) + 1);
      }
    });

    return counts;
  }, [allTeamTasks, team]);
  const allTeamOpenTaskCount = useMemo(
    () => allTeamTasks.filter((task) => isOpenStatus(task.status)).length,
    [allTeamTasks],
  );

  const activityLog = useMemo<ActivityLogItem[]>(() => {
    const closedActionLabels: Partial<Record<Status, string>> = {
      done: "kmml",
      rejected: "rfd",
      removed: "t7yd",
      cancelled: "lgha",
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
        action: post.status === "working" ? "bda mahma dyal lpost" : "t3ayyen lih mahma dyal lpost",
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
          action: `${closedActionLabels[post.status] ?? "bddl"} mahma dyal lpost`,
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
        const commentDetail = post.title;

        items.push({
          id: `comment-assigned-${comment.id}`,
          actorId: comment.assigneeId,
          actorName: commentAssignee,
          action: comment.parentId ? "t3ayyen lih mahma dyal rradd" : "t3ayyen lih mahma dyal tta3li9",
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
            action: `${closedActionLabels[comment.status] ?? "bddl"} mahma dyal tta3li9`,
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
      parts.push(activeStatus === "all" ? "ga3 l7alat" : statusLabels[activeStatus].toLowerCase());
    }
    if (activeScope === "with-comments") parts.push("m3a tta3ali9");
    if (activeAssignee !== "all") parts.push(getMemberName(team, activeAssignee));
    if (searchQuery.trim()) parts.push(`kaytsift 3la "${searchQuery.trim()}"`);
    return parts.join(" - ");
  }, [activeAssignee, activeScope, activeStatus, searchQuery, sortMode, team]);

  const emptyState = useMemo(() => {
    if (posts.length === 0) {
      return {
        title: "Mazal ma kayn ta3yin",
        body: "Sawb awel lpost dyal Reddit b zrr dyal + post jdid.",
      };
    }

    if (searchQuery.trim()) {
      return {
        title: "Ma l9ina walo b had t9lib",
        body: `Ma kayn la 3onwan, la ta3li9, la subreddit, la chi wa7ed kaytsift m3a "${searchQuery.trim()}". Mse7 t9lib bach tchof l9aima kamla.`,
      };
    }

    if (activeScope === "with-comments") {
      return {
        title: "Ma kaynch lposts fihom ta3ali9 hna",
        body: "Rje3 lga3 lposts wla zid ta3yin dyal ta3li9 lchi lpost.",
      };
    }

    if (activeAssignee !== "all") {
      return {
        title: `Ma kaynach lmaham dyal ${getMemberName(team, activeAssignee)}`,
        body: "Khtar ga3 team wla chi wa7ed akhor.",
      };
    }

    return {
      title: "Ma kayn ta3yin kaytsift",
      body: activeStatus === "active"
        ? "Ga3 dakchi li kayban salat wla msdoud. Bddl l7ala lga3 l7alat wla sawb post jdida."
        : "Jarrab filter akhor wla rje3 lfilters l7alhom.",
    };
  }, [activeAssignee, activeScope, activeStatus, posts.length, searchQuery, team]);
  /* ── Handlers ─────────────────────────────────────────────── */


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
    const found = team.find((m) => m.slug === loginDraft.slug);
    if (!found) { setLoginError("Ma l9inach had l3odw."); return; }
    const expectedPassword = found.isAdmin ? ADMIN_PASSWORD : MEMBER_PASSWORD;
    if (loginDraft.password !== expectedPassword) {
      setLoginError("Lmot de passe ghalet. 3awed.");
      return;
    }
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
    if (!assigneeId) { setPostError("Team mazal ma t7mlatch. 3awed."); return; }

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
        setPostError("Ma t7afdtch lpost. 3awed t9ad.");
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

  async function handleGlobalCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentModalError("");
    const { postId, body, assigneeId, isAiDraft } = commentModalDraft;
    if (!postId) { setCommentModalError("Khtar lpost louwel."); return; }
    if (!body.trim()) { setCommentModalError("Ktob nass dyal tta3li9."); return; }
    if (!assigneeId) { setCommentModalError("Khtar li ghaykhdem 3la tta3li9."); return; }

    setIsSubmittingComment(true);
    try {
      const insertPayload: Record<string, string | boolean> = {
        post_id: postId,
        body: body.trim(),
        assignee_id: assigneeId,
        status: "queued",
        is_ai_draft: isAiDraft,
      };
      if (currentUser?.id) insertPayload.created_by_id = currentUser.id;

      const fallbackColumns = ["created_by_id", "is_ai_draft"];
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
        const message = formatSupabaseError(error);
        console.error("[global-create-comment] Supabase error:", message);
        setCommentModalError("Ma t7afdtch tta3li9. 3awed t9ad.");
        return;
      }

      setCommentModalDraft({ postId: "", body: "", assigneeId, isAiDraft: false });
      setIsCreateCommentOpen(false);
      setIsPostDropdownOpen(false);
      setPostSearchQuery("");
      await loadPosts();
    } finally {
      setIsSubmittingComment(false);
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
      return false;
    }
    await loadPosts();
    return true;
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
      await deleteComment(task.commentId);
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
    showToast("Salat mahma dyal lpost!");
    setPostProofDrafts((cur) => ({ ...cur, [task.postId]: clean }));
  }

  async function copyLinkToClipboard(id: string, url?: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    window.setTimeout(() => setCopiedLinkId(null), 1500);
  }

  async function deletePost(postId: string) {
    const deleted = await updatePost(postId, {
      status: "cancelled",
      softDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: currentUser?.id ?? null,
      rejectionReason: "Lghaha ladmin",
    });
    showToast(deleted ? "Tlgat lmahma" : "Ma tlgatch lmahma. 3awed.");
  }

  async function deleteComment(commentId: string) {
    if (!currentUser?.isAdmin) return;

    const { error } = await supabase.from("reddit_comments").delete().eq("id", commentId);
    if (error) {
      console.error("[delete-comment]", formatSupabaseError(error));
      showToast("Ma tms7atch tta3li9. 3awed.");
      return;
    }

    showToast("Tms7at tta3li9");
    await loadPosts();
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
            Kayt7mel tool dyal orchestration
          </p>
        </div>
      </main>
    );
  }

  /* ── Login ─────────────────────────────────────────────────── */
  const selectedLoginMember = team.find((member) => member.slug === loginDraft.slug) ?? team[0];

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
                alt="Logo dyal Reddit"
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
                Tool dyal orchestration
              </h1>
              <p style={{ marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Dkhol bach tchof l&apos;maham dyawlk
              </p>
            </div>
          </div>

          <div className="glass-card" style={{ padding: "28px" }}>
            <form
              onSubmit={handleLogin}
              style={{ display: "flex", flexDirection: "column", gap: "18px" }}
            >
              <Field label="Profil dyalk">
                <div ref={loginMemberDropdownRef} style={{ position: "relative" }}>
                  <button
                    type="button"
                    data-testid="login-member-picker-trigger"
                    aria-expanded={isLoginMemberDropdownOpen}
                    aria-haspopup="listbox"
                    onClick={() => setIsLoginMemberDropdownOpen((isOpen) => !isOpen)}
                    style={{
                      width: "100%",
                      minHeight: "54px",
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      color: "var(--text-primary)",
                      textAlign: "left",
                      background: isLoginMemberDropdownOpen ? "var(--bg-card-hover)" : "var(--bg-elevated)",
                      border: `1px solid ${isLoginMemberDropdownOpen ? "var(--accent)" : "var(--border-bright)"}`,
                      borderRadius: "8px",
                      boxShadow: isLoginMemberDropdownOpen ? "0 0 0 3px var(--accent-dim)" : "none",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      {selectedLoginMember && (
                        <Avatar
                          member={selectedLoginMember}
                          size={36}
                          index={team.findIndex((member) => member.id === selectedLoginMember.id)}
                        />
                      )}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "0.86rem", fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedLoginMember?.name ?? "Khtar chi wa7ed mn team"}
                        </span>
                        <span style={{ display: "block", marginTop: "2px", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>
                  {selectedLoginMember?.isAdmin ? "L'admin" : "3odw f team"}
                        </span>
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: isLoginMemberDropdownOpen ? "var(--accent)" : "var(--text-muted)", fontSize: "0.9rem", fontWeight: 900, flexShrink: 0 }}>
                      {isLoginMemberDropdownOpen ? "^" : "v"}
                    </span>
                  </button>

                  {isLoginMemberDropdownOpen && (
                    <div
                      role="listbox"
                      aria-label="Khtar lprofil dyalk"
                      data-testid="login-member-picker-options"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        left: 0,
                        right: 0,
                        zIndex: 10,
                        maxHeight: "332px",
                        overflowY: "auto",
                        padding: "6px",
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-bright)",
                        borderRadius: "10px",
                        boxShadow: "0 16px 32px rgba(0,0,0,0.45)",
                      }}
                    >
                      {team.map((member, index) => {
                        const isSelected = loginDraft.slug === member.slug;

                        return (
                          <button
                            key={member.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setLoginDraft((current) => ({ ...current, slug: member.slug }));
                              setLoginError("");
                              setIsLoginMemberDropdownOpen(false);
                            }}
                            style={{
                              width: "100%",
                              minHeight: "50px",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "8px",
                              color: "var(--text-primary)",
                              textAlign: "left",
                              background: isSelected ? "var(--accent-dim)" : "transparent",
                              border: "none",
                              borderRadius: "7px",
                            }}
                          >
                            <Avatar member={member} size={34} index={index} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {member.name}
                              </span>
                              <span style={{ display: "block", marginTop: "1px", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700 }}>
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
              </Field>

              <Field label="Lmot de passe">
                <input
                  value={loginDraft.password}
                  onChange={(e) =>
                    setLoginDraft((cur) => ({ ...cur, password: e.target.value }))
                  }
                  type="password"
                  placeholder="Dkhel lmot de passe dyal team"
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
                7ell ldashboard →
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const isAdmin = currentUser.isAdmin;
  const currentUserIndex = team.findIndex((m) => m.id === currentUser.id);
  const selectedTeamFilterMember = team.find((member) => member.id === teamFilterAssignee);
  const selectedTeamFilterOpenTaskCount = selectedTeamFilterMember
    ? teamOpenTaskCounts.get(selectedTeamFilterMember.id) ?? 0
    : allTeamOpenTaskCount;

  /* ── Member View ─────────────────────────────────────────── */
  if (!isAdmin) {
    const nextTaskText =
      pendingTasks.length === 0
        ? "Mazal ma kayn walo"
        : `${pendingTasks.length} lmaham khassk tkmmel`;

    return (
      <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        <TopNav
          currentUser={currentUser}
          currentUserIndex={currentUserIndex}
          notifications={activityLog}
          pendingCount={pendingTaskCount}
          onLogout={handleLogout}
          team={team}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
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
                  L&apos;maham dyawlk
                </h1>
                <p style={{ marginTop: "5px", color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: 1.55 }}>
                  7ell awel karta, khdem f Reddit, w rje3 hna bach tdir Salat.
                </p>
              </div>
              <div className="member-count-strip" aria-label="Khla9at lmaham">
                <MetricPill label="Mazal" value={pendingTasks.length} tone="accent" />
                <MetricPill label="Salat" value={doneTasks.length} tone="green" />
              </div>
            </div>
          </div>
        </section>

        <section style={{ width: "100%", padding: "22px clamp(16px, 2vw, 28px) 34px" }}>
          <div style={{ display: "grid", gap: "18px" }}>
            <div className="member-tabs" role="tablist" aria-label="Lmaham dyal l3odw">
              <button
                type="button"
                role="tab"
                aria-selected={memberTab === "my-tasks"}
                className={memberTab === "my-tasks" ? "is-active" : ""}
                onClick={() => {
                  setMemberTab("my-tasks");
                  setIsTeamFilterDropdownOpen(false);
                }}
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Lmaham Dyawli
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
                L&apos;maham dyal team
                <span>{filteredTeamTasks.length}</span>
              </button>
            </div>

            {memberTab === "my-tasks" ? (
              <>
                <TaskSection currentUser={currentUser} onDeleteTask={deleteTask}
                  copiedLinkId={copiedLinkId}
                  emptyText="Daba ma kaynach mahma. Lmaham jdad mn Mehdi Admin ghaybano hna."
                  onCompletePostTask={completePostTask}
                  onCopyLink={copyLinkToClipboard}
                  onPostProofChange={(postId, value) =>
                    setPostProofDrafts((cur) => ({ ...cur, [postId]: value }))
                  }
                  onStatusChange={updateAssignedTaskStatus}
                  postProofDrafts={postProofDrafts}
                  tasks={memberPendingTasks}
                  team={team}
                  title="BDI DABA"
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
                    <span style={{ fontWeight: 850 }}>L&apos;maham li salaw</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 800 }}>
                      {doneTasks.length} {showDoneTasks ? "baynin" : "mkhbiyyin"} {showDoneTasks ? "▴" : "▾"}
                    </span>
                  </button>

                  {showDoneTasks && (
                    <TaskSection currentUser={currentUser} onDeleteTask={deleteTask}
                      copiedLinkId={copiedLinkId}
                      emptyText="L'maham li salaw ghaybano hna."
                      onCompletePostTask={completePostTask}
                      onCopyLink={copyLinkToClipboard}
                      onPostProofChange={(postId, value) =>
                        setPostProofDrafts((cur) => ({ ...cur, [postId]: value }))
                      }
                      onStatusChange={updateAssignedTaskStatus}
                      postProofDrafts={postProofDrafts}
                      tasks={recentDoneTasks}
                      team={team}
                      title="Salat"
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
                  <div ref={teamFilterDropdownRef} style={{ position: "relative", width: "min(100%, 360px)" }}>
                    <p id="team-task-filter-label" style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 850, textTransform: "uppercase" }}>
                      Filtri l&apos;maham dyal team
                    </p>
                    <button
                      type="button"
                      data-testid="team-task-filter-trigger"
                      aria-labelledby="team-task-filter-label"
                      aria-expanded={isTeamFilterDropdownOpen}
                      aria-haspopup="listbox"
                      onClick={() => setIsTeamFilterDropdownOpen((isOpen) => !isOpen)}
                      style={{
                        width: "100%",
                        minHeight: "52px",
                        marginTop: "8px",
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        textAlign: "left",
                        color: "var(--text-primary)",
                        background: isTeamFilterDropdownOpen ? "var(--bg-card-hover)" : "var(--bg-elevated)",
                        border: `1px solid ${isTeamFilterDropdownOpen ? "var(--accent)" : "var(--border-bright)"}`,
                        borderRadius: "8px",
                        boxShadow: isTeamFilterDropdownOpen ? "0 0 0 3px var(--accent-dim)" : "none",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        {selectedTeamFilterMember ? (
                          <Avatar
                            member={selectedTeamFilterMember}
                            size={32}
                            index={team.findIndex((member) => member.id === selectedTeamFilterMember.id)}
                          />
                        ) : (
                          <span aria-hidden="true" style={{ display: "flex", alignItems: "center", width: "52px", height: "32px" }}>
                            {team.slice(0, 3).map((member, index) => (
                              <span
                                key={member.id}
                                style={{ marginLeft: index === 0 ? 0 : "-10px", zIndex: 3 - index, border: "2px solid var(--bg-elevated)", borderRadius: "50%" }}
                              >
                                <Avatar member={member} size={28} index={index} />
                              </span>
                            ))}
                          </span>
                        )}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {selectedTeamFilterMember?.name ?? "Ga3 team"}
                          </span>
                          <span style={{ display: "block", marginTop: "2px", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>
                            {selectedTeamFilterOpenTaskCount} lmaham mazal
                          </span>
                        </span>
                      </span>
                      <span aria-hidden="true" style={{ color: isTeamFilterDropdownOpen ? "var(--accent)" : "var(--text-muted)", fontSize: "0.9rem", fontWeight: 900, flexShrink: 0 }}>
                        {isTeamFilterDropdownOpen ? "^" : "v"}
                      </span>
                    </button>

                    {isTeamFilterDropdownOpen && (
                      <div
                        role="listbox"
                        aria-labelledby="team-task-filter-label"
                        data-testid="team-task-filter-options"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 8px)",
                          left: 0,
                          zIndex: 70,
                          width: "100%",
                          maxHeight: "332px",
                          overflowY: "auto",
                          padding: "6px",
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-bright)",
                          borderRadius: "10px",
                          boxShadow: "0 16px 32px rgba(0,0,0,0.45)",
                        }}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={teamFilterAssignee === "all"}
                          onClick={() => {
                            setTeamFilterAssignee("all");
                            setIsTeamFilterDropdownOpen(false);
                          }}
                          style={{
                            width: "100%",
                            minHeight: "46px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "7px 8px",
                            color: "var(--text-primary)",
                            textAlign: "left",
                            background: teamFilterAssignee === "all" ? "var(--accent-dim)" : "transparent",
                            border: "none",
                            borderRadius: "7px",
                          }}
                        >
                          <span aria-hidden="true" style={{ display: "flex", alignItems: "center", width: "42px", height: "30px" }}>
                            {team.slice(0, 3).map((member, index) => (
                              <span
                                key={member.id}
                                style={{ marginLeft: index === 0 ? 0 : "-9px", zIndex: 3 - index, border: "2px solid var(--bg-card)", borderRadius: "50%" }}
                              >
                                <Avatar member={member} size={26} index={index} />
                              </span>
                            ))}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 850 }}>Ga3 team</span>
                            <span style={{ display: "block", marginTop: "1px", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700 }}>
                              {allTeamOpenTaskCount} lmaham mazal
                            </span>
                          </span>
                          {teamFilterAssignee === "all" && <span aria-hidden="true" style={{ color: "var(--accent)", fontWeight: 900 }}>✓</span>}
                        </button>

                        {team.map((member, index) => {
                          const isSelected = teamFilterAssignee === member.id;
                          const openTaskCount = teamOpenTaskCounts.get(member.id) ?? 0;

                          return (
                            <button
                              key={member.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                setTeamFilterAssignee(member.id);
                                setIsTeamFilterDropdownOpen(false);
                              }}
                              style={{
                                width: "100%",
                                minHeight: "46px",
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "7px 8px",
                                color: "var(--text-primary)",
                                textAlign: "left",
                                background: isSelected ? "var(--accent-dim)" : "transparent",
                                border: "none",
                                borderRadius: "7px",
                              }}
                            >
                              <Avatar member={member} size={30} index={index} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {member.name}
                                </span>
                                <span style={{ display: "block", marginTop: "1px", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700 }}>
                                  {openTaskCount} lmaham mazal
                                </span>
                              </span>
                              {isSelected && <span aria-hidden="true" style={{ color: "var(--accent)", fontWeight: 900 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
                <TeamTimelineSection
                  emptyText="Ma kaynach lmaham dyal team kaytsift m3a had filter."
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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
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
                  Zid post dyal Reddit
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "3px" }}>
                  Sawb mahma dyal lpost louwel, mn b3d zid ta3yin dyal tta3ali9 mn lkarta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatePostOpen(false)}
                disabled={isSubmittingPost}
                className="btn-ghost"
                style={{ width: "34px", height: "34px", padding: 0, borderRadius: "50%" }}
                aria-label="Sedd tsayeb lpost"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={handleCreatePost}
              style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <Field label="L3onwan">
                <input
                  value={postDraft.title}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, title: e.target.value }))
                  }
                  placeholder="Lsa9 l3onwan dyal Reddit kif ma howa"
                  className="input"
                />
              </Field>
              <Field label="Nass dyal lpost">
                <textarea
                  value={postDraft.postBody}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, postBody: e.target.value }))
                  }
                  placeholder="Lsa9 nass dyal lpost hna"
                  className="input"
                  style={{ minHeight: "140px", resize: "vertical" }}
                />
              </Field>
              <Field label="Zid media (ikhtiyari)">
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
                      <span style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "4px" }}>Klik bach tbddl lfile</span>
                    </>
                  ) : (
                    <>
                      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ marginBottom: "8px" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800 }}>Klik wla jerr lfile bach tla3o</span>
                      <span style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "4px" }}>Kay9bel tsawer w videos</span>
                    </>
                  )}
                </div>
              </Field>
              <Field label="Link dyal subreddit">
                <input
                  value={postDraft.subredditUrl}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, subredditUrl: e.target.value }))
                  }
                  placeholder="https://reddit.com/r/example"
                  className="input"
                />
              </Field>
              <Field label="3ayyen lpost l">
                <TeamMemberPicker
                  value={postDraft.assigneeId}
                  onChange={(assigneeId) =>
                    setPostDraft((current) => ({ ...current, assigneeId }))
                  }
                  fallbackToAdmin={false}
                  menuPlacement="top"
                  ariaLabel="3ayyen lpost l"
                  placeholder="Khtar li ghaykhdem 3la lpost"
                  team={team}
                />
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
                  Btel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPost}
                  className="btn-primary"
                  style={{ minWidth: "112px" }}
                >
                  {isSubmittingPost ? "Kayt7afed..." : "3ayyen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCreateCommentOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-comment-title"
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
            if (e.target === e.currentTarget && !isSubmittingComment) {
              setIsCreateCommentOpen(false);
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
                <h2 id="create-comment-title" style={{ fontWeight: 900, fontSize: "1.1rem" }}>
                  Zid ta3yin dyal ta3li9
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "3px" }}>
                  Khtar post kayn, ktob tta3li9, w 3ayyenha lchi wa7ed mn team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCommentOpen(false)}
                disabled={isSubmittingComment}
                className="btn-ghost"
                style={{ width: "34px", height: "34px", padding: 0, borderRadius: "50%" }}
                aria-label="Sedd zid tta3li9"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={handleGlobalCreateComment}
              style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <Field label="Khtar lpost dyal Reddit">
                <div ref={postDropdownRef} style={{ position: "relative" }}>
                  {/* Custom Toggle Button */}
                  <button
                    type="button"
                    onClick={() => setIsPostDropdownOpen(!isPostDropdownOpen)}
                    className="input"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      cursor: "pointer",
                      background: "var(--bg-elevated)",
                      textAlign: "left",
                      height: "auto",
                      minHeight: "44px",
                    }}
                  >
                    {(() => {
                      const selectedPost = posts.find(p => p.id === commentModalDraft.postId);
                      if (!selectedPost) return <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Khtar lpost...</span>;
                      const postAssignee = team.find(m => m.id === selectedPost.assigneeId) || team[0];
                      const postAssigneeIndex = team.findIndex(m => m.id === selectedPost.assigneeId);
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, width: "100%" }}>
                          <Avatar member={postAssignee} size={24} index={postAssigneeIndex >= 0 ? postAssigneeIndex : 0} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontWeight: 855, fontSize: "0.76rem", color: "var(--accent)", display: "block" }}>
                              {getSubredditName(selectedPost.subredditUrl)}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {selectedPost.title}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, marginLeft: "8px" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Box */}
                  {isPostDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-bright)",
                        borderRadius: "10px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                        zIndex: 50,
                        display: "flex",
                        flexDirection: "column",
                        maxHeight: "300px",
                      }}
                    >
                      {/* Search Input */}
                      <div style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                        <input
                          type="text"
                          placeholder="Qelleb f lposts b l3onwan, subreddit, wla li m3ayyen..."
                          value={postSearchQuery}
                          onChange={(e) => setPostSearchQuery(e.target.value)}
                          className="input"
                          style={{ height: "36px", fontSize: "0.82rem" }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()} // Prevent close on click
                        />
                      </div>

                      {/* List Option Items */}
                      <ul
                        style={{
                          overflowY: "auto",
                          padding: "6px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                          listStyle: "none",
                          margin: 0
                        }}
                      >
                        {(() => {
                          const filtered = posts
                            .filter((p) => !p.softDeleted)
                            .filter((p) => {
                              const norm = postSearchQuery.toLowerCase().trim();
                              if (!norm) return true;
                              const sub = getSubredditName(p.subredditUrl).toLowerCase();
                              const title = p.title.toLowerCase();
                              const assigneeName = getMemberName(team, p.assigneeId).toLowerCase();
                              return sub.includes(norm) || title.includes(norm) || assigneeName.includes(norm);
                            });

                          if (filtered.length === 0) {
                            return (
                              <li style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 700 }}>
                                Ma l9ina 7ta post kaytsift
                              </li>
                            );
                          }

                          return filtered.map((p) => {
                            const postAssignee = team.find(m => m.id === p.assigneeId) || team[0];
                            const postAssigneeIndex = team.findIndex(m => m.id === p.assigneeId);
                            const isSelected = commentModalDraft.postId === p.id;
                            return (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCommentModalDraft((cur) => ({ ...cur, postId: p.id }));
                                    setIsPostDropdownOpen(false);
                                    setPostSearchQuery("");
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    width: "100%",
                                    padding: "8px 10px",
                                    background: isSelected ? "var(--accent-dim)" : "transparent",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    transition: "background 0.15s ease",
                                    minWidth: 0,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = "var(--bg-elevated)";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = "transparent";
                                  }}
                                >
                                  <Avatar member={postAssignee} size={28} index={postAssigneeIndex >= 0 ? postAssigneeIndex : 0} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{
                                      fontWeight: 800,
                                      fontSize: "0.72rem",
                                      color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                                      display: "block"
                                    }}>
                                      {getSubredditName(p.subredditUrl)}
                                    </span>
                                    <span style={{
                                      fontWeight: isSelected ? 700 : 500,
                                      fontSize: "0.82rem",
                                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                                      display: "block",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap"
                                    }}>
                                      {p.title}
                                    </span>
                                  </div>
                                </button>
                              </li>
                            );
                          });
                        })()}
                      </ul>
                    </div>
                  )}
                </div>
              </Field>
              <Field label="Nass dyal tta3li9">
                <textarea
                  value={commentModalDraft.body}
                  onChange={(e) =>
                    setCommentModalDraft((cur) => ({ ...cur, body: e.target.value }))
                  }
                  placeholder="Lsa9 nass dyal tta3li9 hna"
                  className="input"
                  style={{ minHeight: "120px", resize: "vertical" }}
                />
              </Field>
              <Field label="3ayyen tta3li9 l">
                <TeamMemberPicker
                  value={commentModalDraft.assigneeId}
                  onChange={(assigneeId) =>
                    setCommentModalDraft((current) => ({ ...current, assigneeId }))
                  }
                  fallbackToAdmin={false}
                  height={40}
                  ariaLabel="3ayyen tta3li9 l"
                  placeholder="Khtar chi wa7ed mn team"
                  team={team}
                />
              </Field>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
                <input
                  type="checkbox"
                  id="comment-modal-ai-draft"
                  checked={commentModalDraft.isAiDraft}
                  onChange={(e) =>
                    setCommentModalDraft((cur) => ({ ...cur, isAiDraft: e.target.checked }))
                  }
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label
                  htmlFor="comment-modal-ai-draft"
                  style={{ fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", userSelect: "none" }}
                >
                  Draft b AI (kayban badge w t9der tnssakh)
                </label>
              </div>

              {commentModalError && (
                <div style={{ background: "rgba(255,69,0,0.1)", border: "1px solid rgba(255,69,0,0.3)", borderRadius: "8px", padding: "10px 14px" }}>
                  <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#ff7043" }}>{commentModalError}</p>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateCommentOpen(false)}
                  disabled={isSubmittingComment}
                  className="btn-ghost"
                >
                  Btel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComment}
                  className="btn-primary"
                  style={{ minWidth: "112px", background: "var(--blue)", color: "#fff" }}
                >
                  {isSubmittingComment ? "Kayt7afed..." : "3ayyen"}
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
                T7akkum f l&apos;maham
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px" }}>
                Chof lkhadma dyal Reddit li mazal, 7ell mahma, w 3ayyen lkhoutwa jaya.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "nowrap" }}>
              <button
                type="button"
                onClick={() => {
                  setCommentModalError("");
                  const firstActivePost = posts.find((p) => !p.softDeleted)?.id || "";
                  setCommentModalDraft({
                    postId: firstActivePost,
                    body: "",
                    assigneeId: team[0]?.id || "",
                    isAiDraft: false,
                  });
                  setIsCreateCommentOpen(true);
                }}
                className="btn-primary"
                style={{
                  padding: "10px 18px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                  background: "var(--blue)",
                  color: "#fff",
                  boxShadow: "0 0 0 0 rgba(59,130,246,0.28)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#2563eb";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.28)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--blue)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                +ta3li9 jdid
              </button>
              <button
                type="button"
                onClick={() => {
                  setPostError("");
                  setIsCreatePostOpen(true);
                }}
                className="btn-primary"
                style={{ padding: "10px 18px", borderRadius: "999px", whiteSpace: "nowrap" }}
              >
                + post jdid
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <MetricCard
              active={activeScope === "all" && activeStatus === "all"}
              accent="var(--accent)"
              hint="Bayyen ga3 lposts"
              label="Lposts"
              onClick={() => applyMetricFilter("posts")}
              value={stats.posts}
            />
            <MetricCard
              active={activeScope === "with-comments"}
              accent="var(--indigo)"
              hint={`${stats.withComments} lposts fihom ta3ali9`}
              label="Ta3ali9"
              onClick={() => applyMetricFilter("comments")}
              value={stats.comments}
            />
            <MetricCard
              active={activeStatus === "queued"}
              accent="var(--yellow)"
              hint="Khdma katsna"
              label="mazal"
              onClick={() => applyMetricFilter("queued")}
              value={stats.queued}
            />
            <MetricCard
              active={activeStatus === "done"}
              accent="var(--green)"
              hint="Khdma salat"
              label="Salat"
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
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
        className="admin-grid"
      >
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
            <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>L9aima dyal tta3yin</h2>
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
            {filteredPosts.length} baynin - {sortLabels[sortMode]}
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
              className="task-cards-grid"
              style={{
                display: "grid",
                gap: "14px",
              }}
            >
              {filteredPosts.map((post) => {
                const draft = commentDrafts[getCommentDraftKey(currentUser!.id, post.id)] ?? {
                  body: "",
                  assigneeId: "",
                  isAiDraft: false,
                };
                return (
                  <PostCard key={post.id} post={post} team={team} onDeleteComment={deleteComment} onDeletePost={deletePost}
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

      <style>{`
        .task-card-clickable {
          cursor: pointer;
          transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
        }

        .task-card-clickable:hover {
          transform: translateY(-2px);
          border-color: var(--accent) !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        }

        .task-cards-grid {
          grid-template-columns: repeat(3, 1fr);
        }

        @media (max-width: 1200px) {
          .task-cards-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }

        @media (max-width: 760px) {
          .task-cards-grid {
            grid-template-columns: 1fr !important;
          }
        }

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
