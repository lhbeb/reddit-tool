"use client";

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

/* ─── Types ──────────────────────────────────────────────────── */
type Status = "queued" | "working" | "done";

type TeamMember = {
  id: string;
  name: string;
};

type RedditComment = {
  id: string;
  body: string;
  assigneeId: string;
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
  assigneeId: string;
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
const STORAGE_KEY = "reddit-assignment-console-v1";
const SESSION_KEY = "reddit-assignment-session-v1";
const ROSTER_VERSION = 2;
const LOCAL_PASSWORD = "Localserver!!2";
const ADMIN_ID = "mehdi";

const defaultTeam: TeamMember[] = [
  { id: "mehdi",    name: "Mehdi Admin" },
  { id: "member-2", name: "Jebbar" },
  { id: "member-3", name: "Walid" },
  { id: "member-4", name: "Janah" },
  { id: "member-5", name: "Yassine" },
  { id: "member-6", name: "Amine" },
  { id: "member-7", name: "Abdo" },
  { id: "member-8", name: "Othman" },
];

const statusLabels: Record<Status, string> = {
  queued:  "Queued",
  working: "Working",
  done:    "Done",
};

/* ─── Helpers ────────────────────────────────────────────────── */
function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
    return (host === "reddit.com" || host.endsWith(".reddit.com")) && path.includes("/comments/");
  } catch { return false; }
}

function getSubredditName(url: string) {
  const fallback = "r/subreddit";
  if (!url.trim()) return fallback;
  try {
    const parsed = new URL(url);
    const sub = parsed.pathname.split("/").filter(Boolean)
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

function isInteractiveElement(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("button, input, select, textarea, a"))
    : false;
}

function parseSavedAssignments(saved: string | null) {
  if (!saved) return { team: defaultTeam, posts: [] as RedditPost[] };
  const parsed = JSON.parse(saved) as {
    rosterVersion?: number;
    team?: TeamMember[];
    posts?: RedditPost[];
  };
  return {
    team: parsed.rosterVersion === ROSTER_VERSION && parsed.team?.length ? parsed.team : defaultTeam,
    posts: parsed.posts ?? [],
  };
}

/** Deterministic avatar colour per team member index */
const AVATAR_COLORS = [
  "#ff4500","#6c63ff","#22c55e","#eab308",
  "#ec4899","#06b6d4","#f97316","#a855f7",
];
function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════════════════ */
export default function Home() {
  const [team, setTeam] = useState<TeamMember[]>(defaultTeam);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [hasLoadedSavedData, setHasLoadedSavedData] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loginDraft, setLoginDraft] = useState({ memberId: defaultTeam[0].id, password: "" });
  const [loginError, setLoginError] = useState("");
  const [activeAssignee, setActiveAssignee] = useState("all");
  const [activeStatus, setActiveStatus] = useState<"all" | Status>("all");
  const [postDraft, setPostDraft] = useState({
    title: "", postBody: "", subredditUrl: "", assigneeId: defaultTeam[0].id,
  });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, { body: string; assigneeId: string }>>({});
  const [postProofDrafts, setPostProofDrafts] = useState<Record<string, string>>({});
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [openReplyComposerIds, setOpenReplyComposerIds] = useState<Record<string, boolean>>({});
  const assignmentCanvasRef = useRef<HTMLDivElement>(null);
  const assignmentDragRef = useRef({ isDragging: false, scrollLeft: 0, startX: 0 });

  /* persist / hydrate */
  useEffect(() => {
    queueMicrotask(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const savedSession = window.localStorage.getItem(SESSION_KEY);
      if (savedSession && defaultTeam.some((m) => m.id === savedSession)) {
        setCurrentUserId(savedSession);
        setActiveAssignee(savedSession);
      }
      if (!saved) { setHasLoadedSavedData(true); return; }
      try {
        const parsed = parseSavedAssignments(saved);
        setTeam(parsed.team);
        setPosts(parsed.posts);
      } catch { window.localStorage.removeItem(STORAGE_KEY); }
      finally { setHasLoadedSavedData(true); }
    });
  }, []);

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        const parsed = parseSavedAssignments(event.newValue);
        setTeam(parsed.team);
        setPosts(parsed.posts);
      } catch { window.localStorage.removeItem(STORAGE_KEY); }
    }
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedData) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ rosterVersion: ROSTER_VERSION, team, posts }));
  }, [hasLoadedSavedData, team, posts]);

  /* derived */
  const stats = useMemo(() => {
    const comments = posts.flatMap((p) => p.comments);
    return {
      posts: posts.length,
      comments: comments.length,
      queued: posts.filter((p) => p.status === "queued").length + comments.filter((c) => c.status === "queued").length,
      done:   posts.filter((p) => p.status === "done").length   + comments.filter((c) => c.status === "done").length,
    };
  }, [posts]);

  const currentUser = useMemo(
    () => team.find((m) => m.id === currentUserId) ?? null,
    [currentUserId, team],
  );

  const assignedTasks = useMemo<AssignedTask[]>(() => {
    if (!currentUserId) return [];
    return posts.flatMap((post) => {
      const commentAssigneeIds = getCommentAssigneeIds(post.comments);
      const assignedPost = post.assigneeId === currentUserId
        ? [{ id: post.id, kind: "post" as const, title: post.title, body: post.postBody, subredditUrl: post.subredditUrl, publishedUrl: post.publishedUrl, assigneeId: post.assigneeId, postAssigneeId: post.assigneeId, commentAssigneeIds, status: post.status, createdAt: post.createdAt, postId: post.id }]
        : [];
      const assignedComments = post.comments
        .filter((c) => c.assigneeId === currentUserId)
        .map((c) => ({ id: c.id, kind: "comment" as const, title: post.title, body: c.body, subredditUrl: post.subredditUrl, publishedUrl: post.publishedUrl, assigneeId: c.assigneeId, postAssigneeId: post.assigneeId, commentAssigneeIds, status: c.status, createdAt: c.createdAt, postId: post.id, commentId: c.id }));
      return [...assignedPost, ...assignedComments];
    });
  }, [currentUserId, posts]);

  const pendingTasks = useMemo(() => assignedTasks.filter((t) => t.status !== "done"), [assignedTasks]);
  const doneTasks    = useMemo(() => assignedTasks.filter((t) => t.status === "done"), [assignedTasks]);
  const pendingTaskCount = pendingTasks.length;

  const filteredPosts = useMemo(() => posts.filter((post) => {
    const assigneeMatch = activeAssignee === "all" || post.assigneeId === activeAssignee || post.comments.some((c) => c.assigneeId === activeAssignee);
    const statusMatch   = activeStatus === "all"   || post.status === activeStatus          || post.comments.some((c) => c.status === activeStatus);
    return assigneeMatch && statusMatch;
  }), [activeAssignee, activeStatus, posts]);

  /* handlers */
  function handleTeamNameChange(id: string, name: string) {
    setTeam((cur) => cur.map((m) => m.id === id ? { ...m, name } : m));
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginDraft.password !== LOCAL_PASSWORD) { setLoginError("Wrong password. Try again."); return; }
    setCurrentUserId(loginDraft.memberId);
    setActiveAssignee(loginDraft.memberId);
    setLoginDraft((cur) => ({ ...cur, password: "" }));
    setLoginError("");
    window.localStorage.setItem(SESSION_KEY, loginDraft.memberId);
  }

  function handleLogout() {
    setCurrentUserId(null);
    setActiveAssignee("all");
    window.localStorage.removeItem(SESSION_KEY);
  }

  function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postDraft.title.trim() || !postDraft.postBody.trim()) return;
    const newPost: RedditPost = {
      id: makeId("post"),
      title: postDraft.title.trim(),
      postBody: postDraft.postBody.trim(),
      subredditUrl: postDraft.subredditUrl.trim(),
      publishedUrl: "",
      assigneeId: postDraft.assigneeId,
      status: "queued",
      createdAt: new Date().toISOString(),
      comments: [],
    };
    setPosts((cur) => [newPost, ...cur]);
    setPostDraft({ title: "", postBody: "", subredditUrl: "", assigneeId: postDraft.assigneeId });
  }

  function handleCreateComment(postId: string, parentId?: string | null) {
    const draftKey = getCommentDraftKey(postId, parentId);
    const draft = commentDrafts[draftKey];
    if (!draft?.body.trim()) return;
    const newComment: RedditComment = {
      id: makeId("comment"),
      body: draft.body.trim(),
      assigneeId: draft.assigneeId,
      status: "queued",
      createdAt: new Date().toISOString(),
      parentId: parentId ?? null,
    };
    setPosts((cur) => cur.map((p) => p.id === postId ? { ...p, comments: [...p.comments, newComment] } : p));
    setCommentDrafts((cur) => ({ ...cur, [draftKey]: { body: "", assigneeId: draft.assigneeId } }));
  }

  function updatePost(postId: string, changes: Partial<RedditPost>) {
    setPosts((cur) => cur.map((p) => p.id === postId ? { ...p, ...changes } : p));
  }

  function updateComment(postId: string, commentId: string, changes: Partial<RedditComment>) {
    setPosts((cur) => cur.map((p) =>
      p.id === postId
        ? { ...p, comments: p.comments.map((c) => c.id === commentId ? { ...c, ...changes } : c) }
        : p,
    ));
  }

  function updateAssignedTaskStatus(task: AssignedTask, status: Status) {
    if (task.kind === "post") { updatePost(task.postId, { status }); return; }
    if (task.commentId) updateComment(task.postId, task.commentId, { status });
  }

  function completePostTask(task: AssignedTask, publishedUrl: string) {
    const clean = publishedUrl.trim();
    if (!isUsableRedditLink(clean) || task.kind !== "post") return;
    updatePost(task.postId, { publishedUrl: clean, status: "done" });
    setPostProofDrafts((cur) => ({ ...cur, [task.postId]: clean }));
  }

  async function copyLinkToClipboard(id: string, url?: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    window.setTimeout(() => setCopiedLinkId(null), 1500);
  }

  function deletePost(postId: string) {
    setPosts((cur) => cur.filter((p) => p.id !== postId));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ team, posts }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reddit-assignments.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleAssignmentCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isInteractiveElement(event.target)) return;
    const canvas = assignmentCanvasRef.current;
    if (!canvas) return;
    assignmentDragRef.current = { isDragging: true, scrollLeft: canvas.scrollLeft, startX: event.clientX };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  }

  function handleAssignmentCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    const canvas = assignmentCanvasRef.current;
    const drag = assignmentDragRef.current;
    if (!canvas || !drag.isDragging) return;
    event.preventDefault();
    canvas.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  }

  function handleAssignmentCanvasPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const canvas = assignmentCanvasRef.current;
    assignmentDragRef.current.isDragging = false;
    canvas?.classList.remove("is-dragging");
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  /* ── Loading ───────────────────────────────────────────────── */
  if (!hasLoadedSavedData) {
    return (
      <main className="grid min-h-screen place-items-center mesh-bg">
        <div className="flex flex-col items-center gap-4 fade-up">
          <div
            className="h-10 w-10 rounded-full border-2 border-transparent spin"
            style={{ borderTopColor: "var(--accent)", borderRightColor: "rgba(255,69,0,0.3)" }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
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
          {/* Logo row */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div
              style={{
                background: "rgba(255,69,0,0.12)",
                border: "1px solid rgba(255,69,0,0.25)",
                borderRadius: "16px",
                padding: "14px 20px",
              }}
            >
              <Image src="/reddit-1.svg" alt="Reddit logo" width={120} height={40} priority className="h-8 w-auto" style={{ filter: "brightness(0) saturate(100%) invert(38%) sepia(99%) saturate(700%) hue-rotate(353deg) brightness(100%) contrast(102%)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--text-primary)", lineHeight: 1.2 }}>
                Assignment Desk
              </h1>
              <p style={{ marginTop: "4px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Sign in to access your tasks
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="glass-card" style={{ padding: "28px" }}>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <Field label="Who are you?">
                <select
                  value={loginDraft.memberId}
                  onChange={(e) => setLoginDraft((cur) => ({ ...cur, memberId: e.target.value }))}
                  className="input"
                  style={{ height: "44px" }}
                >
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Password">
                <input
                  value={loginDraft.password}
                  onChange={(e) => setLoginDraft((cur) => ({ ...cur, password: e.target.value }))}
                  type="password"
                  placeholder="Enter team password"
                  className="input"
                  style={{ height: "44px" }}
                />
              </Field>

              {loginError && (
                <div style={{ background: "rgba(255,69,0,0.1)", border: "1px solid rgba(255,69,0,0.25)", borderRadius: "8px", padding: "10px 14px" }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ff7043" }}>{loginError}</p>
                </div>
              )}

              <button type="submit" className="btn-primary" style={{ height: "46px", fontSize: "0.9rem", marginTop: "4px" }}>
                Open dashboard →
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const isAdmin = currentUser.id === ADMIN_ID;
  const currentUserIndex = team.findIndex((m) => m.id === currentUserId);

  /* ── Member View ───────────────────────────────────────────── */
  if (!isAdmin) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        {/* Navbar */}
        <TopNav
          currentUser={currentUser}
          currentUserIndex={currentUserIndex}
          pendingCount={pendingTaskCount}
          onLogout={handleLogout}
        />

        {/* Hero header */}
        <section style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", padding: "28px 0 24px" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px" }}>
            <h1 style={{ fontSize: "1.7rem", fontWeight: 900, lineHeight: 1.2 }}>Your tasks</h1>
            <p style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.6 }}>
              New work from Mehdi Admin appears here. Do the task, then mark it done.
            </p>

            {/* Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "20px" }}>
              <MetricCard label="To do"      value={pendingTasks.length} accent="var(--accent)" />
              <MetricCard label="Finished"   value={doneTasks.length}    accent="var(--green)" />
              <MetricCard label="All tasks"  value={assignedTasks.length} accent="var(--indigo)" />
            </div>
          </div>
        </section>

        {/* Tasks */}
        <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px" }}>
          <div style={{ display: "grid", gap: "20px", gridTemplateColumns: "minmax(0,1fr)" }}>
            <TaskSection
              copiedLinkId={copiedLinkId}
              emptyText="No tasks to do right now. Check back soon!"
              onCompletePostTask={completePostTask}
              onCopyLink={copyLinkToClipboard}
              onPostProofChange={(postId, value) => setPostProofDrafts((cur) => ({ ...cur, [postId]: value }))}
              onStatusChange={updateAssignedTaskStatus}
              postProofDrafts={postProofDrafts}
              tasks={pendingTasks}
              team={team}
              title="Tasks to do"
            />
            <TaskSection
              copiedLinkId={copiedLinkId}
              emptyText="Finished tasks will appear here."
              onCompletePostTask={completePostTask}
              onCopyLink={copyLinkToClipboard}
              onPostProofChange={(postId, value) => setPostProofDrafts((cur) => ({ ...cur, [postId]: value }))}
              onStatusChange={updateAssignedTaskStatus}
              postProofDrafts={postProofDrafts}
              tasks={doneTasks}
              team={team}
              title="Finished"
            />
          </div>
        </section>
      </main>
    );
  }

  /* ── Admin View ────────────────────────────────────────────── */
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      {/* Navbar */}
      <TopNav
        currentUser={currentUser}
        currentUserIndex={0}
        pendingCount={pendingTaskCount}
        onLogout={handleLogout}
      />

      {/* Header metrics */}
      <section style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", padding: "20px 0" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 24px" }}>
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
        {/* ── Sidebar ── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Add post form */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ background: "var(--accent-dim)", borderRadius: "8px", padding: "5px 7px", fontSize: "1rem" }}>✍️</span>
                <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>Add Reddit post</h2>
              </div>
              <button
                form="new-post-form"
                type="submit"
                className="btn-primary"
                style={{ padding: "7px 16px", fontSize: "0.8rem" }}
              >
                Assign
              </button>
            </div>
            <form id="new-post-form" onSubmit={handleCreatePost} style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <Field label="Title">
                <input
                  value={postDraft.title}
                  onChange={(e) => setPostDraft((cur) => ({ ...cur, title: e.target.value }))}
                  placeholder="Paste the exact Reddit title"
                  className="input"
                />
              </Field>
              <Field label="Post body">
                <textarea
                  value={postDraft.postBody}
                  onChange={(e) => setPostDraft((cur) => ({ ...cur, postBody: e.target.value }))}
                  placeholder="Paste the post body here"
                  className="input"
                  style={{ minHeight: "100px", resize: "vertical" }}
                />
              </Field>
              <Field label="Subreddit link">
                <input
                  value={postDraft.subredditUrl}
                  onChange={(e) => setPostDraft((cur) => ({ ...cur, subredditUrl: e.target.value }))}
                  placeholder="https://reddit.com/r/example"
                  className="input"
                />
              </Field>
              <Field label="Assign post to">
                <select
                  value={postDraft.assigneeId}
                  onChange={(e) => setPostDraft((cur) => ({ ...cur, assigneeId: e.target.value }))}
                  className="input"
                >
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
            </form>
          </div>

          {/* Team roster */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ background: "var(--indigo-dim)", borderRadius: "8px", padding: "5px 7px", fontSize: "1rem" }}>👥</span>
                <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>Team of 8</h2>
              </div>
              <button onClick={exportJson} className="btn-ghost" style={{ padding: "5px 12px", fontSize: "0.75rem" }}>
                Export JSON
              </button>
            </div>
            <div style={{ padding: "12px 18px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
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
            </div>
          </div>
        </aside>

        {/* ── Kanban ── */}
        <section style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          {/* Queue header + filters */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>Assignment queue</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "2px" }}>
                Drag the canvas sideways to scroll through all cards.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <select
                value={activeAssignee}
                onChange={(e) => setActiveAssignee(e.target.value)}
                className="input"
                style={{ height: "38px", minWidth: "148px", fontSize: "0.82rem" }}
              >
                <option value="all">All people</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select
                value={activeStatus}
                onChange={(e) => setActiveStatus(e.target.value as "all" | Status)}
                className="input"
                style={{ height: "38px", minWidth: "130px", fontSize: "0.82rem" }}
              >
                <option value="all">All status</option>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Kanban canvas */}
          <div
            ref={assignmentCanvasRef}
            onPointerDown={handleAssignmentCanvasPointerDown}
            onPointerLeave={handleAssignmentCanvasPointerEnd}
            onPointerMove={handleAssignmentCanvasPointerMove}
            onPointerUp={handleAssignmentCanvasPointerEnd}
            className="drag-canvas"
            style={{
              minHeight: "540px",
              overflowX: "auto",
              borderRadius: "14px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}
          >
            {filteredPosts.length === 0 ? (
              <div style={{ minHeight: "540px", display: "grid", placeItems: "center", padding: "40px", textAlign: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "3rem" }}>📋</span>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 900 }}>No assignments yet</h3>
                  <p style={{ color: "var(--text-muted)", maxWidth: "360px", lineHeight: 1.6, fontSize: "0.88rem" }}>
                    Add a title, post body, subreddit link and a teammate using the form on the left.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "16px", padding: "16px", width: "max-content", minWidth: "100%" }}>
                {filteredPosts.map((post) => {
                  const draft = commentDrafts[post.id] ?? { body: "", assigneeId: team[0]?.id ?? "" };
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
                        setOpenReplyComposerIds((cur) => ({ ...cur, [commentId]: !cur[commentId] }))
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </section>

      {/* Responsive admin grid */}
      <style>{`
        @media (max-width: 900px) {
          .admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PostCard — admin kanban card
═══════════════════════════════════════════════════════════════ */
function PostCard({
  post,
  team,
  commentDraft,
  commentDrafts,
  openReplyComposerIds,
  onCommentDraftChange,
  onCreateComment,
  onDeletePost,
  onUpdatePost,
  onUpdateComment,
  onToggleReply,
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

  const glowClass =
    post.status === "done"    ? "status-glow-done"
    : post.status === "working" ? "status-glow-working"
    : "status-glow-queued";

  return (
    <article
      className={glowClass}
      style={{
        width: "min(760px, calc(100vw - 2rem))",
        flexShrink: 0,
        borderRadius: "12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-bright)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Post header */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
          <span style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--accent)" }}>
            {getSubredditName(post.subredditUrl)}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>•</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            assigned to {getMemberName(team, post.assigneeId)}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>•</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{formatShortDate(post.createdAt)}</span>
          <StatusPill status={post.status} />
        </div>

        {/* Title */}
        <h3 style={{ marginTop: "10px", fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.35, color: "var(--text-primary)" }}>
          {post.title}
        </h3>

        {/* Body */}
        <p style={{ marginTop: "10px", whiteSpace: "pre-wrap", fontSize: "0.88rem", lineHeight: 1.75, color: "var(--text-secondary)" }}>
          {post.postBody}
        </p>

        {/* Subreddit link */}
        {post.subredditUrl && (
          <a
            href={post.subredditUrl}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: "10px", display: "inline-block", fontSize: "0.78rem", fontWeight: 700, color: "#60a5fa", wordBreak: "break-all" }}
          >
            {post.subredditUrl}
          </a>
        )}

        {/* Assignment flow */}
        <AssignmentFlow post={post} team={team} />

        {/* Admin controls toggle */}
        <button
          type="button"
          onClick={() => setShowControls((v) => !v)}
          style={{
            marginTop: "14px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: showControls ? "var(--accent)" : "var(--text-muted)",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ display: "inline-block", transition: "transform 200ms", transform: showControls ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          Admin controls
        </button>

        {showControls && (
          <div
            style={{
              marginTop: "10px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "14px",
              display: "grid",
              gridTemplateColumns: "1fr 140px auto",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <select
              value={post.assigneeId}
              onChange={(e) => onUpdatePost(post.id, { assigneeId: e.target.value })}
              className="input"
              style={{ height: "38px", fontSize: "0.82rem" }}
              aria-label="Post assignee"
            >
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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
              style={{ height: "38px", padding: "0 12px", borderRadius: "8px", border: "1px solid rgba(255,69,0,0.3)", background: "rgba(255,69,0,0.08)", color: "#ff7043", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
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

      {/* Comments section */}
      <div style={{ padding: "16px 18px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h4 style={{ fontWeight: 800, fontSize: "0.88rem" }}>Comments</h4>
          <span style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "999px", padding: "2px 10px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
            {post.comments.length}
          </span>
        </div>

        {/* Comment composer */}
        <CommentComposer
          assigneeId={commentDraft.assigneeId}
          body={commentDraft.body}
          buttonLabel="Add comment"
          onAssigneeChange={(assigneeId) => onCommentDraftChange(post.id, { ...commentDraft, assigneeId })}
          onBodyChange={(body) => onCommentDraftChange(post.id, { ...commentDraft, body })}
          onSubmit={() => onCreateComment(post.id)}
          placeholder="Paste comment text"
          team={team}
        />

        {/* Thread */}
        <div style={{ marginTop: "12px", background: "var(--bg-elevated)", borderRadius: "10px", padding: "10px" }}>
          {getChildComments(post.comments).length === 0 ? (
            <p style={{ textAlign: "center", padding: "16px", fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
              No comments yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {getChildComments(post.comments).map((comment) => (
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
                  onUpdateComment={(commentId, changes) => onUpdateComment(post.id, commentId, changes)}
                  onToggleReply={onToggleReply}
                  postLinkReady={isUsableRedditLink(post.publishedUrl)}
                  team={team}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════════ */

/* Top navigation bar */
function TopNav({
  currentUser,
  currentUserIndex,
  pendingCount,
  onLogout,
}: {
  currentUser: TeamMember;
  currentUserIndex: number;
  pendingCount: number;
  onLogout: () => void;
}) {
  return (
    <nav style={{
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
    }}>
      {/* Left — brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
        <div style={{ background: "rgba(255,69,0,0.1)", border: "1px solid rgba(255,69,0,0.2)", borderRadius: "10px", padding: "5px 10px" }}>
          <Image src="/reddit-1.svg" alt="Reddit logo" width={80} height={28} className="h-6 w-auto" style={{ filter: "brightness(0) saturate(100%) invert(38%) sepia(99%) saturate(700%) hue-rotate(353deg) brightness(100%) contrast(102%)" }} />
        </div>

        {/* User chip */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-bright)", borderRadius: "999px", padding: "4px 12px 4px 4px" }}>
          <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: avatarColor(currentUserIndex), display: "grid", placeItems: "center", fontSize: "0.65rem", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {initials(currentUser.name)}
          </span>
          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{currentUser.name}</span>
        </div>
      </div>

      {/* Right — actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <NotificationBell count={pendingCount} />
        <button onClick={onLogout} className="btn-ghost" style={{ fontSize: "0.75rem", padding: "6px 14px" }}>
          Logout
        </button>
      </div>
    </nav>
  );
}

/* Metric card */
function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "14px 18px",
      borderTop: `2px solid ${accent}`,
    }}>
      <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
      <p style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1.1, color: accent, marginTop: "4px" }}>{value}</p>
    </div>
  );
}

/* Status pill */
function StatusPill({ status }: { status: Status }) {
  const config: Record<Status, { label: string; bg: string; color: string }> = {
    queued:  { label: "🔴 Queued",  bg: "rgba(255,69,0,0.12)",  color: "#ff7043" },
    working: { label: "🟡 Working", bg: "rgba(234,179,8,0.12)", color: "#fbbf24" },
    done:    { label: "🟢 Done",    bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
  };
  const { label, bg, color } = config[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: bg, color, borderRadius: "999px", padding: "2px 10px", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

/* Assignment flow (admin card) */
function AssignmentFlow({ post, team }: { post: RedditPost; team: TeamMember[] }) {
  const commentAssigneeIds = getCommentAssigneeIds(post.comments);
  const finishedComments = post.comments.filter((c) => c.status === "done").length;
  const postLinkReady = isUsableRedditLink(post.publishedUrl);

  return (
    <div style={{ marginTop: "14px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "8px", alignItems: "stretch" }}>
        <FlowStep
          helper={postLinkReady ? "Final Reddit link is ready for commenters." : "Needs final Reddit post link from assignee."}
          isReady={post.status === "done" && postLinkReady}
          label="Post + title"
          person={getMemberName(team, post.assigneeId)}
          step="1"
          status={statusLabels[post.status]}
        />
        <div style={{ display: "grid", placeItems: "center", fontSize: "1.1rem", fontWeight: 900, color: "var(--accent)", padding: "0 4px" }}>→</div>
        <FlowStep
          helper={postLinkReady ? "Comment assignees can open the Reddit post." : "Comment assignees wait until the post link is added."}
          isReady={post.comments.length > 0 && finishedComments === post.comments.length}
          label="Comments"
          person={post.comments.length > 0 ? getAssigneeList(team, commentAssigneeIds) : "Add comment assignments below"}
          step="2"
          status={post.comments.length > 0 ? `${finishedComments}/${post.comments.length} done` : "0 assigned"}
        />
      </div>
    </div>
  );
}

/* Member task flow */
function MemberTaskFlow({ task, team }: { task: AssignedTask; team: TeamMember[] }) {
  const isPostTask = task.kind === "post";
  const postLinkReady = isUsableRedditLink(task.publishedUrl);
  const commentPeople = task.commentAssigneeIds.length > 0 ? getAssigneeList(team, task.commentAssigneeIds) : "Comment team";

  return (
    <div style={{ marginTop: "12px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "8px", alignItems: "stretch" }}>
      <FlowStep
        compact
        helper={isPostTask ? "Publish the title and post, then paste the Reddit link." : postLinkReady ? "Post link is ready." : "Waiting for this person to add the post link."}
        isReady={!isPostTask && postLinkReady}
        label="Post + title"
        person={isPostTask ? "You" : getMemberName(team, task.postAssigneeId)}
        step="1"
        status={isPostTask ? "Your step" : postLinkReady ? "Ready" : "Waiting"}
      />
      <div style={{ display: "grid", placeItems: "center", fontSize: "1rem", fontWeight: 900, color: "var(--accent)", padding: "0 4px" }}>→</div>
      <FlowStep
        compact
        helper={isPostTask ? "These people use your link after you finish." : postLinkReady ? "Open or copy the link, comment, then mark done." : "This unlocks after the post link exists."}
        isReady={task.status === "done"}
        label={isPostTask ? "Comments" : "Your comment"}
        person={isPostTask ? commentPeople : "You"}
        step="2"
        status={isPostTask ? (task.commentAssigneeIds.length > 0 ? "Next" : "Not assigned yet") : task.status === "done" ? "Done" : postLinkReady ? "Do now" : "Locked"}
      />
    </div>
  );
}

/* Flow step */
function FlowStep({
  compact = false,
  helper,
  isReady,
  label,
  person,
  status,
  step,
}: {
  compact?: boolean;
  helper: string;
  isReady: boolean;
  label: string;
  person: string;
  status: string;
  step: string;
}) {
  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${isReady ? "rgba(34,197,94,0.3)" : "var(--border)"}`, borderRadius: "8px", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{
          flexShrink: 0,
          width: "26px", height: "26px",
          borderRadius: "50%",
          background: isReady ? "var(--green)" : "var(--accent)",
          display: "grid",
          placeItems: "center",
          fontSize: "0.7rem",
          fontWeight: 900,
          color: "#fff",
        }}>
          {isReady ? "✓" : step}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
            <p style={{ fontWeight: 800, fontSize: compact ? "0.78rem" : "0.85rem", color: "var(--text-primary)" }}>{label}</p>
            <span style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "999px", padding: "1px 8px", fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)" }}>{status}</span>
          </div>
          <p style={{ marginTop: "3px", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{person}</p>
          <p style={{ marginTop: "3px", fontSize: "0.72rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{helper}</p>
        </div>
      </div>
    </div>
  );
}

/* Notification bell */
function NotificationBell({ count }: { count: number }) {
  const hasPending = count > 0;
  return (
    <div
      aria-label={hasPending ? `${count} unfinished assigned tasks` : "No unfinished assigned tasks"}
      title={hasPending ? `${count} unfinished assigned tasks` : "No unfinished assigned tasks"}
      style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-bright)", borderRadius: "999px", padding: "5px 12px 5px 5px" }}
    >
      <span style={{ position: "relative", width: "28px", height: "28px", background: hasPending ? "var(--accent-dim)" : "var(--bg-card)", borderRadius: "50%", display: "grid", placeItems: "center" }} className={hasPending ? "pulse-ring" : ""}>
        <svg aria-hidden="true" style={{ width: "14px", height: "14px", color: hasPending ? "var(--accent)" : "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0" />
        </svg>
        {hasPending && <span style={{ position: "absolute", top: "1px", right: "1px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", border: "2px solid var(--bg-base)" }} />}
      </span>
      <span style={{ display: "none" }} className="sm:inline" />
      <span style={{ fontSize: "0.78rem", fontWeight: 800, color: hasPending ? "var(--accent)" : "var(--text-muted)", minWidth: "16px", textAlign: "center" }}>{count}</span>
    </div>
  );
}

/* Comment composer */
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
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", display: "grid", gridTemplateColumns: "1fr 150px auto", gap: "8px" }}>
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
        {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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

/* Threaded comment */
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
  const draft = getDraft(comment.id);
  const replyOpen = isReplyOpen(comment.id);

  return (
    <div style={{ paddingLeft: level > 0 ? "20px" : "0" }}>
      <div style={{ position: "relative", borderLeft: "2px solid rgba(255,69,0,0.25)", paddingLeft: "14px", marginBottom: "4px" }}>
        {/* thread dot */}
        <span style={{ position: "absolute", left: "-5px", top: "18px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} />

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", marginBottom: "6px" }}>
          {/* Header */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
              assigned to{" "}
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{getMemberName(team, comment.assigneeId)}</span>
              {" "}• {formatShortDate(comment.createdAt)}
            </p>
            <StatusPill status={comment.status} />
          </div>

          {/* Body */}
          <p style={{ marginTop: "8px", whiteSpace: "pre-wrap", fontSize: "0.83rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
            {comment.body}
          </p>

          {/* Controls */}
          <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "6px", flex: 1, minWidth: "0" }}>
              <select
                value={comment.assigneeId}
                onChange={(e) => onUpdateComment(comment.id, { assigneeId: e.target.value })}
                className="input"
                style={{ height: "32px", fontSize: "0.78rem", flex: 1 }}
                aria-label={`Assignee for comment by ${getMemberName(team, comment.assigneeId)}`}
              >
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select
                value={comment.status}
                onChange={(e) => onUpdateComment(comment.id, { status: e.target.value as Status })}
                className="input"
                style={{ height: "32px", fontSize: "0.78rem", flex: 1 }}
                aria-label="Comment status"
              >
                {Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, background: postLinkReady ? "rgba(96,165,250,0.12)" : "rgba(234,179,8,0.12)", color: postLinkReady ? "#60a5fa" : "#fbbf24", borderRadius: "999px", padding: "2px 8px" }}>
                {postLinkReady ? "Ready to comment" : "Waiting for post link"}
              </span>
              <button
                type="button"
                onClick={() => onToggleReply(comment.id)}
                style={{ fontSize: "0.75rem", fontWeight: 700, background: "transparent", border: "none", color: replyOpen ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", padding: "2px 0" }}
              >
                {replyOpen ? "✕ Cancel" : "↩ Reply"}
              </button>
            </div>
          </div>

          {/* Reply composer */}
          {replyOpen && (
            <div style={{ marginTop: "10px" }}>
              <CommentComposer
                assigneeId={draft.assigneeId}
                body={draft.body}
                buttonLabel="Reply"
                onAssigneeChange={(assigneeId) => onDraftChange(comment.id, { ...draft, assigneeId })}
                onBodyChange={(body) => onDraftChange(comment.id, { ...draft, body })}
                onSubmit={() => onCreateReply(comment.id)}
                placeholder="Reply to this comment"
                team={team}
              />
            </div>
          )}
        </div>

        {/* Child comments */}
        {childComments.length > 0 && (
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

/* Task section (member view) */
function TaskSection({
  copiedLinkId, emptyText, onCompletePostTask, onCopyLink, onPostProofChange,
  onStatusChange, postProofDrafts, tasks, team, title,
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
}) {
  return (
    <section style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontWeight: 800, fontSize: "1rem" }}>{title}</h2>
        <span style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "999px", padding: "2px 12px", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center" }}>
          <span style={{ fontSize: "2rem" }}>✅</span>
          <p style={{ marginTop: "8px", fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>{emptyText}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)" }}>
          {tasks.map((task) => {
            const proofValue    = postProofDrafts[task.postId] ?? task.publishedUrl ?? "";
            const proofReady    = isUsableRedditLink(proofValue);
            const postLinkReady = isUsableRedditLink(task.publishedUrl);

            const glowClass =
              task.status === "done"    ? "status-glow-done"
              : task.status === "working" ? "status-glow-working"
              : "status-glow-queued";

            return (
              <article
                key={task.id}
                className={glowClass}
                style={{ background: "var(--bg-card)", padding: "18px" }}
              >
                {/* Meta */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontWeight: 800, fontSize: "0.78rem", color: "var(--accent)" }}>{getSubredditName(task.subredditUrl)}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>•</span>
                    <span style={{ fontSize: "0.72rem", background: task.kind === "post" ? "var(--accent-dim)" : "var(--indigo-dim)", color: task.kind === "post" ? "#ff7043" : "var(--indigo)", borderRadius: "999px", padding: "1px 8px", fontWeight: 700 }}>
                      {task.kind === "post" ? "📝 Post task" : "💬 Comment task"}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{formatShortDate(task.createdAt)}</span>
                  </div>
                  <StatusPill status={task.status} />
                </div>

                {/* Title */}
                <h3 style={{ marginTop: "10px", fontSize: "1rem", fontWeight: 800, lineHeight: 1.35 }}>{task.title}</h3>

                {/* Flow */}
                <MemberTaskFlow task={task} team={team} />

                {/* Body */}
                <p style={{ marginTop: "12px", whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.75, color: "var(--text-secondary)" }}>{task.body}</p>

                {/* Post task — completion proof */}
                {task.kind === "post" ? (
                  <div style={{ marginTop: "16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px" }}>
                    <p style={{ fontWeight: 800, fontSize: "0.85rem" }}>Completion proof</p>
                    <p style={{ marginTop: "4px", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                      Publish the post on Reddit, paste the final link, then press Mark done. That unlocks the comment team.
                    </p>
                    <input
                      value={proofValue}
                      onChange={(e) => onPostProofChange(task.postId, e.target.value)}
                      placeholder="https://www.reddit.com/r/.../comments/..."
                      className="input"
                      style={{ marginTop: "10px", height: "40px", fontSize: "0.82rem" }}
                    />
                    <p style={{ marginTop: "6px", fontSize: "0.75rem", fontWeight: 700, color: proofReady ? "var(--green)" : "#ff7043" }}>
                      {proofReady ? "✓ Link ready — mark done to notify comment assignees." : "Paste a valid Reddit post link before marking done."}
                    </p>
                    {postLinkReady && task.publishedUrl && (
                      <a href={task.publishedUrl} target="_blank" rel="noreferrer" style={{ marginTop: "6px", display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#60a5fa", wordBreak: "break-all" }}>
                        Posted: {task.publishedUrl}
                      </a>
                    )}
                  </div>
                ) : (
                  /* Comment task — post link */
                  <div style={{ marginTop: "16px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px" }}>
                    <p style={{ fontWeight: 800, fontSize: "0.85rem" }}>Reddit post link</p>
                    {postLinkReady && task.publishedUrl ? (
                      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <a href={task.publishedUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ fontSize: "0.82rem", padding: "8px 18px", borderRadius: "999px", textDecoration: "none" }}>
                          Open post →
                        </a>
                        <button
                          type="button"
                          onClick={() => onCopyLink(task.id, task.publishedUrl)}
                          className="btn-ghost"
                          style={{ borderRadius: "999px", padding: "8px 18px", fontSize: "0.82rem" }}
                        >
                          {copiedLinkId === task.id ? "✓ Copied" : "Copy link"}
                        </button>
                      </div>
                    ) : (
                      <p style={{ marginTop: "6px", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                        Waiting for the post assignee to paste the final Reddit link. Your buttons unlock when the link is ready.
                      </p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "8px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                  {task.status === "queued" && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(task, "working")}
                      disabled={task.kind === "comment" && !postLinkReady}
                      className="btn-ghost"
                      style={{ borderRadius: "999px", padding: "8px 20px" }}
                    >
                      Start
                    </button>
                  )}
                  {task.status !== "done" ? (
                    <button
                      type="button"
                      onClick={() => task.kind === "post" ? onCompletePostTask(task, proofValue) : onStatusChange(task, "done")}
                      disabled={(task.kind === "post" && !proofReady) || (task.kind === "comment" && !postLinkReady)}
                      className="btn-primary"
                      style={{ borderRadius: "999px", padding: "8px 20px" }}
                    >
                      Mark done
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStatusChange(task, "queued")}
                      className="btn-ghost"
                      style={{ borderRadius: "999px", padding: "8px 20px" }}
                    >
                      Move back to tasks
                    </button>
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

/* Field label wrapper */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", marginBottom: "5px", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
