"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

/* ─── Types ──────────────────────────────────────────────────── */
type Status = "queued" | "working" | "done";
type StatusFilter = "active" | "all" | Status;

type TeamMember = {
  id: string;   // UUID from DB
  slug: string; // e.g. "mehdi", "jebbar"
  name: string;
  isAdmin: boolean;
};

type RedditComment = {
  id: string;
  body: string;
  assigneeId: string; // UUID
  status: Status;
  createdAt: string;
  parentId?: string | null;
};

type RedditPost = {
  id: string;
  title: string;
  postBody: string;
  subredditUrl: string;
  publishedUrl?: string;
  assigneeId: string; // UUID
  status: Status;
  createdAt: string;
  comments: RedditComment[];
};

type AssignedTask = {
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
  commentId?: string;
};

/* ─── Constants ──────────────────────────────────────────────── */
const SESSION_KEY = "reddit-assignment-session-v2"; // v2 = slug-based
const LOCAL_PASSWORD = "Localserver!!2";

const statusLabels: Record<Status, string> = {
  queued: "Queued",
  working: "Working",
  done: "Done",
};

/* ─── Helpers ────────────────────────────────────────────────── */
function getMemberName(team: TeamMember[], id: string) {
  return team.find((m) => m.id === id)?.name ?? "Unassigned";
}

function getAssigneeList(team: TeamMember[], ids: string[]) {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return "No one assigned yet";
  return unique.map((id) => getMemberName(team, id)).join(", ");
}

function getCommentAssigneeIds(comments: RedditComment[]) {
  return Array.from(new Set(comments.map((c) => c.assigneeId))).filter(Boolean);
}

function isUsableRedditLink(value?: string) {
  const clean = value?.trim();
  if (!clean) return false;
  try {
    const url = new URL(clean);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (host === "redd.it") return path.length > 1;
    return (
      (host === "reddit.com" || host.endsWith(".reddit.com")) &&
      path.includes("/comments/")
    );
  } catch {
    return false;
  }
}

function getSubredditName(url: string) {
  const fallback = "r/subreddit";
  if (!url.trim()) return fallback;
  try {
    const parsed = new URL(url);
    const sub = parsed.pathname
      .split("/")
      .filter(Boolean)
      .find((part, i, parts) => parts[i - 1]?.toLowerCase() === "r");
    return sub ? `r/${sub}` : fallback;
  } catch {
    const match = url.match(/r\/([^/\s]+)/i);
    return match?.[1] ? `r/${match[1]}` : fallback;
  }
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
}

function getCommentDraftKey(postId: string, parentId?: string | null) {
  return parentId ? `${postId}:${parentId}` : postId;
}

function getChildComments(comments: RedditComment[], parentId?: string | null) {
  return comments
    .filter((c) => (c.parentId ?? null) === (parentId ?? null))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function getDescendantCommentCount(comments: RedditComment[], parentId: string): number {
  const children = getChildComments(comments, parentId);
  return children.reduce(
    (count, child) => count + 1 + getDescendantCommentCount(comments, child.id),
    0,
  );
}
const AVATAR_COLORS = [
  "#ff4500", "#6c63ff", "#22c55e", "#eab308",
  "#ec4899", "#06b6d4", "#f97316", "#a855f7",
];
function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ─── DB row → app type mappers ──────────────────────────────── */
type DbCommentRow = {
  id: string;
  body: string;
  assignee_id: string | null;
  status: string;
  created_at: string;
  parent_id?: string | null;
};

type DbPostRow = {
  id: string;
  title: string;
  post_body: string;
  subreddit_url: string | null;
  published_url?: string | null;
  assignee_id: string | null;
  status: string;
  created_at: string;
  reddit_comments?: DbCommentRow[];
};

type SupabaseSelectPlan = {
  label: string;
  query: string;
};

type SupabaseErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const POST_SELECT_PLANS: SupabaseSelectPlan[] = [
  {
    label: "full",
    query: `
      id, title, post_body, subreddit_url, published_url,
      assignee_id, status, created_at,
      reddit_comments (
        id, body, assignee_id, status, created_at, parent_id
      )
    `,
  },
  {
    label: "without-comment-parent",
    query: `
      id, title, post_body, subreddit_url, published_url,
      assignee_id, status, created_at,
      reddit_comments (
        id, body, assignee_id, status, created_at
      )
    `,
  },
  {
    label: "without-post-link",
    query: `
      id, title, post_body, subreddit_url,
      assignee_id, status, created_at,
      reddit_comments (
        id, body, assignee_id, status, created_at, parent_id
      )
    `,
  },
  {
    label: "base",
    query: `
      id, title, post_body, subreddit_url,
      assignee_id, status, created_at,
      reddit_comments (
        id, body, assignee_id, status, created_at
      )
    `,
  },
];

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "Unknown Supabase error");
  const shaped = error as SupabaseErrorShape;
  const parts = [shaped.code, shaped.message, shaped.details, shaped.hint].filter(Boolean);
  if (parts.length > 0) return parts.join(" | ");
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : "Unknown Supabase error";
  } catch {
    return "Unknown Supabase error";
  }
}

function dbCommentToApp(row: DbCommentRow): RedditComment {
  return {
    id: row.id,
    body: row.body,
    assigneeId: row.assignee_id ?? "",
    status: row.status as Status,
    createdAt: row.created_at,
    parentId: row.parent_id ?? null,
  };
}

function dbPostToApp(row: DbPostRow): RedditPost {
  return {
    id: row.id,
    title: row.title,
    postBody: row.post_body,
    subredditUrl: row.subreddit_url ?? "",
    publishedUrl: row.published_url ?? "",
    assigneeId: row.assignee_id ?? "",
    status: row.status as Status,
    createdAt: row.created_at,
    comments: (row.reddit_comments ?? []).map(dbCommentToApp),
  };
}
/* ═══════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════ */
export default function Home() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [loginDraft, setLoginDraft] = useState({ slug: "mehdi", password: "" });
  const [loginError, setLoginError] = useState("");
  const [activeAssignee, setActiveAssignee] = useState("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postDraft, setPostDraft] = useState({
    title: "", postBody: "", subredditUrl: "", assigneeId: "",
  });
  const [postError, setPostError] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<
    Record<string, { body: string; assigneeId: string }>
  >({});
  const [postProofDrafts, setPostProofDrafts] = useState<Record<string, string>>({});
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [openReplyComposerIds, setOpenReplyComposerIds] = useState<Record<string, boolean>>({});

  /* ── Load team from DB ─────────────────────────────────────── */
  const loadTeam = useCallback(async () => {
    const { data, error } = await supabase
      .from("team_members")
      .select("id, slug, display_name, is_admin")
      .order("sort_order");

    if (error || !data) return [];

    const mapped: TeamMember[] = data.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.display_name,
      isAdmin: row.is_admin,
    }));
    setTeam(mapped);
    return mapped;
  }, []);

  /* ── Load posts + nested comments from DB ──────────────────── */
  const loadPosts = useCallback(async () => {
    let lastError: unknown = null;

    for (const plan of POST_SELECT_PLANS) {
      const { data, error } = await supabase
        .from("reddit_posts")
        .select(plan.query)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPosts((data as unknown as DbPostRow[]).map(dbPostToApp));
        return;
      }

      lastError = error;
    }

    console.error("[loadPosts] Supabase select error:", formatSupabaseError(lastError));
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

  /* ── Derived ────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const comments = posts.flatMap((p) => p.comments);
    return {
      posts: posts.length,
      comments: comments.length,
      queued:
        posts.filter((p) => p.status === "queued").length +
        comments.filter((c) => c.status === "queued").length,
      done:
        posts.filter((p) => p.status === "done").length +
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
                status: post.status,
                createdAt: post.createdAt,
                postId: post.id,
              },
            ]
          : [];

      const assignedComments = post.comments
        .filter((c) => c.assigneeId === currentUser.id)
        .map((c) => ({
          id: c.id,
          kind: "comment" as const,
          title: post.title,
          body: c.body,
          subredditUrl: post.subredditUrl,
          publishedUrl: post.publishedUrl,
          assigneeId: c.assigneeId,
          postAssigneeId: post.assigneeId,
          commentAssigneeIds,
          status: c.status,
          createdAt: c.createdAt,
          postId: post.id,
          commentId: c.id,
        }));

      return [...assignedPost, ...assignedComments];
    });
  }, [currentUser, posts]);

  const pendingTasks = useMemo(
    () => assignedTasks.filter((t) => t.status !== "done"),
    [assignedTasks],
  );
  const doneTasks = useMemo(
    () => assignedTasks.filter((t) => t.status === "done"),
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

  const filteredPosts = useMemo(
    () => {
      const normalizedSearch = searchQuery.trim().toLowerCase();

      return posts.filter((post) => {
        const assigneeMatch =
          activeAssignee === "all" ||
          post.assigneeId === activeAssignee ||
          post.comments.some((c) => c.assigneeId === activeAssignee);
        const statusMatch =
          activeStatus === "all"
            ? true
            : activeStatus === "active"
              ? post.status !== "done" || post.comments.some((c) => c.status !== "done")
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

        return assigneeMatch && statusMatch && searchMatch;
      });
    },
    [activeAssignee, activeStatus, posts, searchQuery, team],
  );

  /* ── Handlers ─────────────────────────────────────────────── */
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
    window.localStorage.setItem(SESSION_KEY, found.slug);
  }

  function handleLogout() {
    setCurrentUser(null);
    setActiveAssignee("all");
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
      const { data, error } = await supabase
        .from("reddit_posts")
        .insert({
          title: postDraft.title.trim(),
          post_body: postDraft.postBody.trim(),
          subreddit_url: postDraft.subredditUrl.trim() || null,
          assignee_id: assigneeId,
          status: "queued",
        })
        .select()
        .single();

      if (error) {
        console.error("[create-post] Supabase error:", error);
        setPostError(`Failed to save: ${error.message}`);
        return;
      }

      if (data) {
        console.log("[create-post] Inserted:", data.id);
        setPostDraft({ title: "", postBody: "", subredditUrl: "", assigneeId });
        // Ensure admin filter shows all so the new post is visible
        setActiveAssignee("all");
        setActiveStatus("active");
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
    if (!draft?.body.trim()) return;

    const insertPayload: Record<string, string> = {
      post_id: postId,
      body: draft.body.trim(),
      assignee_id: draft.assigneeId,
      status: "queued",
    };
    if (parentId) insertPayload.parent_id = parentId;

    const { error } = await supabase.from("reddit_comments").insert(insertPayload);

    if (error) {
      console.error("[create-comment]", formatSupabaseError(error));
      return;
    }

    setCommentDrafts((cur) => ({
      ...cur,
      [draftKey]: { body: "", assigneeId: draft.assigneeId },
    }));
    await loadPosts();
  }
  async function updatePost(postId: string, changes: Partial<RedditPost>) {
    const dbChanges: Record<string, unknown> = {};
    if (changes.assigneeId !== undefined) dbChanges.assignee_id = changes.assigneeId;
    if (changes.status !== undefined)     dbChanges.status = changes.status;
    if (changes.publishedUrl !== undefined) dbChanges.published_url = changes.publishedUrl;

    const { error } = await supabase.from("reddit_posts").update(dbChanges).eq("id", postId);
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

    await supabase.from("reddit_comments").update(dbChanges).eq("id", commentId);
    await loadPosts();
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
    setPostProofDrafts((cur) => ({ ...cur, [task.postId]: clean }));
  }

  async function copyLinkToClipboard(id: string, url?: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    window.setTimeout(() => setCopiedLinkId(null), 1500);
  }

  async function deletePost(postId: string) {
    await supabase.from("reddit_posts").delete().eq("id", postId);
    await loadPosts();
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
              letterSpacing: "0.1em",
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
          pendingCount={pendingTaskCount}
          onLogout={handleLogout}
        />

        <section
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            padding: "22px 0",
          }}
        >
          <div style={{ maxWidth: "940px", margin: "0 auto", padding: "0 20px" }}>
            <div className="member-hero-row">
              <div style={{ minWidth: 0 }}>
                <p style={{ color: "var(--accent)", fontSize: "0.76rem", fontWeight: 850 }}>
                  {nextTaskText}
                </p>
                <h1 style={{ marginTop: "5px", fontSize: "1.22rem", fontWeight: 900, lineHeight: 1.25 }}>
                  Your queue
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

        <section style={{ maxWidth: "940px", margin: "0 auto", padding: "22px 20px 34px" }}>
          <div style={{ display: "grid", gap: "14px" }}>
            <TaskSection
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
              title="Do these now"
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
                <TaskSection
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
          </div>
        </section>

        <style>{`
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

          .member-task-card {
            background: var(--bg-card);
            padding: 16px;
          }

          .member-task-card.is-done {
            opacity: 0.72;
          }

          .member-task-header,
          .member-action-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
          }

          .member-action-panel {
            margin-top: 14px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
          }

          .member-proof-row {
            margin-top: 10px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
          }

          .member-flow-line {
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            color: var(--text-muted);
            font-size: 0.76rem;
            font-weight: 800;
          }

          .member-flow-dot {
            width: 22px;
            height: 22px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            background: var(--accent-dim);
            color: var(--accent);
            font-size: 0.72rem;
            font-weight: 900;
          }

          .member-flow-dot.ready {
            background: var(--green-dim);
            color: var(--green);
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
        pendingCount={pendingTaskCount}
        onLogout={handleLogout}
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
                <select
                  value={postDraft.assigneeId}
                  onChange={(e) =>
                    setPostDraft((cur) => ({ ...cur, assigneeId: e.target.value }))
                  }
                  className="input"
                >
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
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
            <MetricCard label="Posts"    value={stats.posts}    accent="var(--accent)" />
            <MetricCard label="Comments" value={stats.comments} accent="var(--indigo)" />
            <MetricCard label="Queued"   value={stats.queued}   accent="var(--yellow)" />
            <MetricCard label="Done"     value={stats.done}     accent="var(--green)" />
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
                  onClick={() => {
                    setSearchQuery("");
                    setActiveAssignee("all");
                    setActiveStatus("active");
                  }}
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
                    <span
                      style={{
                        flexShrink: 0,
                        width: "34px",
                        height: "34px",
                        borderRadius: "50%",
                        background: avatarColor(index),
                        display: "grid",
                        placeItems: "center",
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        color: "#fff",
                      }}
                    >
                      {initials(member.name)}
                    </span>
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
                Active work is shown by default. Expand a card only when you need details.
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
              {filteredPosts.length} shown
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
                  <span style={{ fontSize: "3rem" }}>📋</span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900 }}>
                    No matching assignments
                  </h3>
                  <p
                    style={{
                      color: "var(--text-muted)",
                      maxWidth: "360px",
                      lineHeight: 1.6,
                      fontSize: "0.88rem",
                    }}
                  >
                    Try another search or filter, or create a new post from the top button.
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
                  };
                  return (
                    <PostCard
                      key={post.id}
                      post={post}
                      team={team}
                      commentDraft={draft}
                      commentDrafts={commentDrafts}
                      openReplyComposerIds={openReplyComposerIds}
                      onCommentDraftChange={(key, value) =>
                        setCommentDrafts((cur) => ({ ...cur, [key]: value }))
                      }
                      onCreateComment={handleCreateComment}
                      onDeletePost={deletePost}
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
        .post-card-summary {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: start;
        }

        .post-card-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
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
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PostCard
═══════════════════════════════════════════════════════════════ */
function PostCard({
  post, team, commentDraft, commentDrafts, openReplyComposerIds,
  onCommentDraftChange, onCreateComment, onDeletePost, onUpdatePost, onUpdateComment, onToggleReply,
}: {
  post: RedditPost;
  team: TeamMember[];
  commentDraft: { body: string; assigneeId: string };
  commentDrafts: Record<string, { body: string; assigneeId: string }>;
  openReplyComposerIds: Record<string, boolean>;
  onCommentDraftChange: (key: string, value: { body: string; assigneeId: string }) => void;
  onCreateComment: (postId: string, parentId?: string | null) => void;
  onDeletePost: (postId: string) => void;
  onUpdatePost: (postId: string, changes: Partial<RedditPost>) => void;
  onUpdateComment: (postId: string, commentId: string, changes: Partial<RedditComment>) => void;
  onToggleReply: (commentId: string) => void;
}) {
  const [showControls, setShowControls] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const commentAssigneeIds = getCommentAssigneeIds(post.comments);
  const totalComments = post.comments.length;
  const finishedComments = post.comments.filter((c) => c.status === "done").length;
  const activeComments = post.comments.filter((c) => c.status !== "done").length;
  const openComments = totalComments - finishedComments;
  const rootComments = getChildComments(post.comments);
  const postLinkReady = isUsableRedditLink(post.publishedUrl);
  const commentAssigneeText =
    totalComments > 0
      ? getAssigneeList(team, commentAssigneeIds)
      : "No comments assigned yet";
  const commentProgressText =
    totalComments === 0
      ? "0 comments"
      : activeComments === 0
        ? "All comments done"
        : `${activeComments} active comment${activeComments === 1 ? "" : "s"}`;
  const expandedCommentProgressText =
    totalComments > 0 ? `${finishedComments}/${totalComments} comments done` : "0 comments";
  const commentStateText =
    totalComments === 0
      ? "Add comment assignments after the post task"
      : openComments === 0
        ? "All comments complete"
        : `${openComments} comment${openComments === 1 ? "" : "s"} still open`;
  const commentTone =
    totalComments > 0 && openComments === 0
      ? "var(--green)"
      : totalComments > 0
        ? "var(--yellow)"
        : "var(--text-muted)";
  const glowClass =
    post.status === "done" ? "status-glow-done"
    : post.status === "working" ? "status-glow-working"
    : "status-glow-queued";

  function toggleExpanded() {
    if (isExpanded) setShowControls(false);
    setIsExpanded((value) => !value);
  }

  return (
    <article
      className={glowClass}
      style={{
        width: "100%",
        borderRadius: "12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-bright)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px" }}>
        <div className="post-card-summary">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent)" }}>
                {getSubredditName(post.subredditUrl)}
              </span>
              <StatusPill status={post.status} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                {formatShortDate(post.createdAt)}
              </span>
              <span
                style={{
                  border: `1px solid ${postLinkReady ? "rgba(34,197,94,0.25)" : "rgba(234,179,8,0.22)"}`,
                  background: postLinkReady ? "rgba(34,197,94,0.10)" : "rgba(234,179,8,0.10)",
                  color: postLinkReady ? "#4ade80" : "#fbbf24",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                {postLinkReady ? "Post link ready" : "Waiting for post link"}
              </span>
            </div>

            <h3
              title={post.title}
              style={{
                marginTop: "9px",
                fontSize: "1rem",
                fontWeight: 850,
                lineHeight: 1.35,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {post.title}
            </h3>
          </div>

          <div className="post-card-actions">
            <TeamMemberChip memberId={post.assigneeId} team={team} label="Post" />
            <span
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: commentTone,
                borderRadius: "999px",
                padding: "6px 10px",
                fontSize: "0.76rem",
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {commentProgressText}
            </span>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={toggleExpanded}
              className={isExpanded ? "btn-ghost" : "btn-primary"}
              style={{ height: "34px", padding: "0 14px", fontSize: "0.78rem" }}
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        <div className="post-flow-strip" aria-label="Assignment path">
          <div className="post-flow-card">
            <p style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)" }}>
              1. Post + title
            </p>
            <div style={{ marginTop: "7px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <TeamMemberChip compact memberId={post.assigneeId} team={team} />
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 700 }}>
                {statusLabels[post.status]}
              </span>
            </div>
          </div>

          <span className="post-flow-arrow" aria-hidden="true">→</span>

          <div className="post-flow-card">
            <p style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)" }}>
              2. Comments
            </p>
            <p
              title={commentAssigneeText}
              style={{
                marginTop: "7px",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
                fontWeight: 800,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {commentAssigneeText}
            </p>
            <p style={{ marginTop: "3px", color: commentTone, fontSize: "0.74rem", fontWeight: 800 }}>
              {commentStateText}
            </p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.015)" }}>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ display: "grid", gap: "12px" }}>
              <section>
                <p style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--text-muted)" }}>
                  Post body
                </p>
                <p
                  style={{
                    marginTop: "6px",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.88rem",
                    lineHeight: 1.75,
                    color: "var(--text-secondary)",
                  }}
                >
                  {post.postBody}
                </p>
              </section>

              <div className="post-link-row">
                {post.subredditUrl && (
                  <a
                    href={post.subredditUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-dark"
                    style={{ fontSize: "0.76rem", padding: "7px 10px", wordBreak: "break-all" }}
                  >
                    Open subreddit
                  </a>
                )}
                {postLinkReady ? (
                  <a
                    href={post.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-dark"
                    style={{ fontSize: "0.76rem", padding: "7px 10px", wordBreak: "break-all" }}
                  >
                    Open Reddit post
                  </a>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700 }}>
                    Final Reddit post link is still missing.
                  </span>
                )}
              </div>
            </div>

            <AssignmentFlow post={post} team={team} />

            <button
              type="button"
              onClick={() => setShowControls((value) => !value)}
              style={{
                marginTop: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.78rem",
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
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
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
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onDeletePost(post.id)}
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
                  Delete
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

          <div style={{ padding: "16px 18px", borderTop: "1px solid var(--border)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <div>
                <h4 style={{ fontWeight: 850, fontSize: "0.9rem" }}>Comments</h4>
                <p style={{ marginTop: "2px", color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 700 }}>
                  Assign comments under this post. Replies stay connected like a Reddit thread.
                </p>
              </div>
              <span
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  padding: "3px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: commentTone,
                  whiteSpace: "nowrap",
                }}
              >
                {expandedCommentProgressText}
              </span>
            </div>

            <CommentComposer
              assigneeId={commentDraft.assigneeId}
              body={commentDraft.body}
              buttonLabel="Add comment"
              onAssigneeChange={(assigneeId) =>
                onCommentDraftChange(post.id, { ...commentDraft, assigneeId })
              }
              onBodyChange={(body) => onCommentDraftChange(post.id, { ...commentDraft, body })}
              onSubmit={() => onCreateComment(post.id)}
              placeholder="Paste comment text"
              team={team}
            />

            <div
              style={{
                marginTop: "12px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "10px",
              }}
            >
              {rootComments.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "16px",
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
                        }
                      }
                      isReplyOpen={(commentId) => Boolean(openReplyComposerIds[commentId])}
                      level={0}
                      onCreateReply={(parentId) => {
                        onCreateComment(post.id, parentId);
                        onToggleReply(parentId);
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
function TopNav({
  currentUser, currentUserIndex, pendingCount, onLogout,
}: {
  currentUser: TeamMember;
  currentUserIndex: number;
  pendingCount: number;
  onLogout: () => void;
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
          <span
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: avatarColor(currentUserIndex),
              display: "grid",
              placeItems: "center",
              fontSize: "0.65rem",
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {initials(currentUser.name)}
          </span>
          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{currentUser.name}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <NotificationBell count={pendingCount} />
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

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "14px 18px",
        borderTop: `2px solid ${accent}`,
      }}
    >
      <p
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "2rem",
          fontWeight: 900,
          lineHeight: 1.1,
          color: accent,
          marginTop: "4px",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function TeamMemberChip({
  compact = false, label, memberId, team,
}: {
  compact?: boolean;
  label?: string;
  memberId: string;
  team: TeamMember[];
}) {
  const memberIndex = team.findIndex((member) => member.id === memberId);
  const colorIndex = memberIndex >= 0 ? memberIndex : 0;
  const name = getMemberName(team, memberId);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "5px" : "6px",
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        borderRadius: "999px",
        padding: compact ? "3px 8px 3px 3px" : "4px 10px 4px 4px",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      {label && (
        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 800 }}>
          {label}
        </span>
      )}
      <span
        aria-hidden="true"
        style={{
          width: compact ? "20px" : "24px",
          height: compact ? "20px" : "24px",
          borderRadius: "50%",
          background: avatarColor(colorIndex),
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: compact ? "0.58rem" : "0.62rem",
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </span>
      <span
        style={{
          color: "var(--text-primary)",
          fontSize: compact ? "0.74rem" : "0.78rem",
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
function StatusPill({ status }: { status: Status }) {
  const config: Record<Status, { label: string; bg: string; color: string }> = {
    queued:  { label: "🔴 Queued",  bg: "rgba(255,69,0,0.12)",  color: "#ff7043" },
    working: { label: "🟡 Working", bg: "rgba(234,179,8,0.12)", color: "#fbbf24" },
    done:    { label: "🟢 Done",    bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
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
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function AssignmentFlow({ post, team }: { post: RedditPost; team: TeamMember[] }) {
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
function MemberTaskFlow({ task, team }: { task: AssignedTask; team: TeamMember[] }) {
  const isPostTask = task.kind === "post";
  const postLinkReady = isUsableRedditLink(task.publishedUrl);
  const stepOneReady = isPostTask ? task.status === "done" && postLinkReady : postLinkReady;
  const stepTwoReady = task.status === "done";
  const postPerson = isPostTask ? "you" : getMemberName(team, task.postAssigneeId);
  const commentPerson = isPostTask ? getAssigneeList(team, task.commentAssigneeIds) : "you";

  return (
    <div className="member-flow-line" aria-label="Task order">
      <span className={`member-flow-dot ${stepOneReady ? "ready" : ""}`}>
        {stepOneReady ? "✓" : "1"}
      </span>
      <span>Post: {postPerson}</span>
      <span style={{ color: "var(--accent)", fontWeight: 900 }}>→</span>
      <span className={`member-flow-dot ${stepTwoReady ? "ready" : ""}`}>
        {stepTwoReady ? "✓" : "2"}
      </span>
      <span>{isPostTask ? "Then comments" : "Your comment"}: {commentPerson}</span>
    </div>
  );
}
function NotificationBell({ count }: { count: number }) {
  const hasPending = count > 0;
  return (
    <div
      aria-label={hasPending ? `${count} unfinished assigned tasks` : "No unfinished assigned tasks"}
      title={hasPending ? `${count} unfinished assigned tasks` : "No unfinished assigned tasks"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-bright)",
        borderRadius: "999px",
        padding: "5px 12px 5px 5px",
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
    </div>
  );
}

function CommentComposer({
  assigneeId, body, buttonLabel, onAssigneeChange, onBodyChange, onSubmit, placeholder, team,
}: {
  assigneeId: string;
  body: string;
  buttonLabel: string;
  onAssigneeChange: (assigneeId: string) => void;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
  placeholder: string;
  team: TeamMember[];
}) {
  return (
    <div
      className="comment-composer"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "12px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 150px auto",
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
      <button
        type="button"
        onClick={onSubmit}
        className="btn-primary"
        style={{ height: "38px", alignSelf: "end", padding: "0 14px", fontSize: "0.78rem" }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function ThreadedComment({
  comment, comments, getDraft, isReplyOpen, level,
  onCreateReply, onDraftChange, onToggleReply, onUpdateComment, postLinkReady, team,
}: {
  comment: RedditComment;
  comments: RedditComment[];
  getDraft: (parentId: string) => { body: string; assigneeId: string };
  isReplyOpen: (commentId: string) => boolean;
  level: number;
  onCreateReply: (parentId: string) => void;
  onDraftChange: (parentId: string, draft: { body: string; assigneeId: string }) => void;
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
                {formatShortDate(comment.createdAt)}
              </span>
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
                {postLinkReady ? "Ready to comment" : "Waiting for post link"}
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
function MetricPill({ label, tone, value }: { label: string; tone: "accent" | "green"; value: number }) {
  const color = tone === "accent" ? "var(--accent)" : "var(--green)";
  return (
    <div className="metric-pill">
      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 800 }}>{label}</span>
      <span style={{ color, fontSize: "0.95rem", fontWeight: 900 }}>{value}</span>
    </div>
  );
}

function TaskSection({
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
}) {
  const isDoneSection = tone === "done";

  return (
    <section
      style={{
        background: "var(--bg-card)",
        border: isDoneSection ? "0" : "1px solid var(--border)",
        borderRadius: isDoneSection ? 0 : "12px",
        overflow: "hidden",
      }}
    >
      {!isDoneSection && (
        <div
          style={{
            padding: "13px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            background: "var(--border)",
          }}
        >
          {tasks.map((task) => {
            const proofValue = postProofDrafts[task.postId] ?? task.publishedUrl ?? "";
            const proofReady = isUsableRedditLink(proofValue);
            const postLinkReady = isUsableRedditLink(task.publishedUrl);
            const isDone = task.status === "done";
            const isPostTask = task.kind === "post";
            const glowClass =
              task.status === "done" ? "status-glow-done"
              : task.status === "working" ? "status-glow-working"
              : "status-glow-queued";
            const actionTitle = isPostTask
              ? "Post on Reddit"
              : postLinkReady
                ? "Comment on Reddit"
                : "Waiting for post link";
            const actionHelp = isPostTask
              ? "Paste the final Reddit post link here. This unlocks the comment team."
              : postLinkReady
                ? "Open the Reddit post, add your comment, then mark this task done."
                : `Waiting for ${getMemberName(team, task.postAssigneeId)} to paste the Reddit post link.`;

            return (
              <article
                key={task.id}
                className={`${glowClass} member-task-card ${isDone ? "is-done" : ""}`}
              >
                <div className="member-task-header">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", alignItems: "center", minWidth: 0 }}>
                    <span style={{ fontWeight: 850, fontSize: "0.78rem", color: "var(--accent)" }}>
                      {getSubredditName(task.subredditUrl)}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        background: isPostTask ? "var(--accent-dim)" : "var(--indigo-dim)",
                        color: isPostTask ? "#ff7043" : "var(--indigo)",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontWeight: 850,
                      }}
                    >
                      {isPostTask ? "Post task" : "Comment task"}
                    </span>
                    <TeamMemberChip compact memberId={task.assigneeId} team={team} />
                  </div>
                  <StatusPill status={task.status} />
                </div>

                <h3 style={{ marginTop: "9px", fontSize: "0.98rem", fontWeight: 850, lineHeight: 1.35 }}>
                  {task.title}
                </h3>

                <MemberTaskFlow task={task} team={team} />

                <p
                  style={{
                    marginTop: "11px",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.84rem",
                    lineHeight: 1.7,
                    color: "var(--text-secondary)",
                  }}
                >
                  {task.body}
                </p>

                <div className="member-action-panel">
                  <div className="member-action-row">
                    <div>
                      <p style={{ fontWeight: 850, fontSize: "0.84rem" }}>{actionTitle}</p>
                      <p style={{ marginTop: "3px", fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                        {actionHelp}
                      </p>
                    </div>
                    {isDone && (
                      <button
                        type="button"
                        onClick={() => onStatusChange(task, "queued")}
                        className="btn-ghost"
                        style={{ borderRadius: "999px", padding: "7px 14px", fontSize: "0.78rem" }}
                      >
                        Move back
                      </button>
                    )}
                  </div>

                  {isPostTask ? (
                    <>
                      <div className="member-proof-row">
                        <input
                          value={proofValue}
                          onChange={(e) => onPostProofChange(task.postId, e.target.value)}
                          placeholder="https://www.reddit.com/r/.../comments/..."
                          className="input"
                          disabled={isDone}
                          style={{ height: "40px", fontSize: "0.82rem" }}
                        />
                        {!isDone && (
                          <button
                            type="button"
                            onClick={() => onCompletePostTask(task, proofValue)}
                            disabled={!proofReady}
                            className="btn-primary"
                            style={{ borderRadius: "999px", padding: "8px 18px", whiteSpace: "nowrap" }}
                          >
                            Mark done
                          </button>
                        )}
                      </div>
                      <p
                        style={{
                          marginTop: "7px",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          color: proofReady ? "var(--green)" : "#ff7043",
                        }}
                      >
                        {proofReady ? "Link ready." : "Paste a valid Reddit post link first."}
                      </p>
                      {postLinkReady && task.publishedUrl && (
                        <a
                          href={task.publishedUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            marginTop: "7px",
                            display: "inline-block",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            color: "#60a5fa",
                            wordBreak: "break-all",
                          }}
                        >
                          Open posted link
                        </a>
                      )}
                    </>
                  ) : postLinkReady && task.publishedUrl ? (
                    <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <a
                        href={task.publishedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary"
                        style={{ fontSize: "0.8rem", padding: "8px 16px", borderRadius: "999px", textDecoration: "none" }}
                      >
                        Open post
                      </a>
                      <button
                        type="button"
                        onClick={() => onCopyLink(task.id, task.publishedUrl)}
                        className="btn-ghost"
                        style={{ borderRadius: "999px", padding: "8px 16px", fontSize: "0.8rem" }}
                      >
                        {copiedLinkId === task.id ? "Copied" : "Copy link"}
                      </button>
                      {!isDone && (
                        <button
                          type="button"
                          onClick={() => onStatusChange(task, "done")}
                          className="btn-primary"
                          style={{ borderRadius: "999px", padding: "8px 16px", fontSize: "0.8rem" }}
                        >
                          Mark done
                        </button>
                      )}
                    </div>
                  ) : (
                    <p style={{ marginTop: "9px", color: "var(--yellow)", fontSize: "0.78rem", fontWeight: 800 }}>
                      This card will unlock when the Reddit post link is ready.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
