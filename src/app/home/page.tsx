"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, TopNav } from "@/components/reddit/task-components";
import { loadRedditPosts } from "@/lib/db/posts";
import { loadTeamMembers } from "@/lib/db/team";
import { supabase } from "@/lib/supabase";
import { getSubredditName, timeAgo, getMemberName } from "@/lib/helpers";
import type { ActivityLogItem, RedditPost, Status, TeamMember } from "@/lib/types";

const SESSION_KEY = "reddit-assignment-session-v2";

type HistoryItem = {
  id: string;
  post_id: string;
  comment_id: string | null;
  actor_id: string | null;
  entity_type: "post" | "comment";
  event_type: string;
  old_status: Status | null;
  new_status: Status | null;
  old_assignee_id: string | null;
  new_assignee_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function HomeAnalytics() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [dbHistory, setDbHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [historySource, setHistorySource] = useState<"database" | "memory">("database");
  const adminMember = useMemo(
    () => team.find((member) => member.isAdmin) ?? team.find((member) => member.slug === "mehdi") ?? team[0],
    [team],
  );

  // Load team and posts
  useEffect(() => {
    (async () => {
      setLoading(true);
      const loadedTeam = await loadTeamMembers();
      setTeam(loadedTeam);

      // Verify Session
      const savedSlug = window.localStorage.getItem(SESSION_KEY);
      const user = savedSlug ? loadedTeam.find((m) => m.slug === savedSlug) : null;
      if (!user) {
        // Redirect to login if no session is active
        router.replace("/");
        return;
      }
      setCurrentUser(user);

      const loadedPosts = await loadRedditPosts();
      setPosts(loadedPosts);

      // Attempt to load from post_history table
      try {
        const { data, error } = await supabase
          .from("post_history")
          .select("id, post_id, comment_id, actor_id, entity_type, event_type, old_status, new_status, old_assignee_id, new_assignee_id, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error || !data) {
          throw new Error("Unable to fetch post_history table");
        }
        setDbHistory(data as HistoryItem[]);
        setHistorySource("database");
      } catch (err) {
        console.warn("DB post_history table not found, falling back to memory-derived log.", err);
        setHistorySource("memory");
      }

      setLoading(false);
    })();
  }, [router]);

  // Real-time subscription to keep metrics alive
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel("reddit-desk-analytics-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reddit_posts" },
        async () => {
          const loadedPosts = await loadRedditPosts();
          setPosts(loadedPosts);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reddit_comments" },
        async () => {
          const loadedPosts = await loadRedditPosts();
          setPosts(loadedPosts);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Derive stats
  const stats = useMemo(() => {
    const activePosts = posts.filter((p) => !p.softDeleted);
    const activeComments = activePosts.flatMap((p) => p.comments);

    const totalTasks = activePosts.length + activeComments.length;
    const completedPosts = activePosts.filter((p) => p.status === "done").length;
    const completedComments = activeComments.filter((c) => c.status === "done").length;
    const totalCompleted = completedPosts + completedComments;

    const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

    // Status distributions
    const queuedPosts = activePosts.filter((p) => p.status === "queued").length;
    const queuedComments = activeComments.filter((c) => c.status === "queued").length;
    const totalQueued = queuedPosts + queuedComments;

    const rejectedPosts = activePosts.filter((p) => p.status === "rejected").length;
    const rejectedComments = activeComments.filter((c) => c.status === "rejected").length;
    const totalRejected = rejectedPosts + rejectedComments;

    const removedPosts = activePosts.filter((p) => p.status === "removed").length;
    const removedComments = activeComments.filter((c) => c.status === "removed").length;
    const totalRemoved = removedPosts + removedComments;

    const softDeletedCount = posts.filter((p) => p.softDeleted).length;

    return {
      totalPosts: activePosts.length,
      totalComments: activeComments.length,
      totalTasks,
      totalCompleted,
      completionRate,
      queued: totalQueued,
      rejected: totalRejected,
      removed: totalRemoved,
      cancelled: softDeletedCount,
    };
  }, [posts]);

  // Leaderboard logic
  const leaderboard = useMemo(() => {
    return team
      .map((member) => {
        const completedPosts = posts.filter(
          (p) => p.assigneeId === member.id && p.status === "done" && !p.softDeleted
        ).length;
        const completedComments = posts
          .flatMap((p) => p.comments)
          .filter((c) => c.assigneeId === member.id && c.status === "done").length;
        
        const totalCompleted = completedPosts + completedComments;

        // Pending counts
        const pendingPosts = posts.filter(
          (p) => p.assigneeId === member.id && p.status !== "done" && !p.softDeleted
        ).length;
        const pendingComments = posts
          .flatMap((p) => p.comments)
          .filter((c) => c.assigneeId === member.id && c.status !== "done").length;

        return {
          ...member,
          completedPosts,
          completedComments,
          totalCompleted,
          totalPending: pendingPosts + pendingComments,
        };
      })
      .sort((a, b) => b.totalCompleted - a.totalCompleted);
  }, [team, posts]);

  // Activity Feed (Dynamic memory fallback / mapped DB values)
  const activityList = useMemo<ActivityLogItem[]>(() => {
    const getActivityActorId = (actorId?: string | null) => actorId || adminMember?.id || "";

    if (historySource === "memory" || dbHistory.length === 0) {
      // Memory-derived activity list (copied from main page fallback activity log layout)
      const items: ActivityLogItem[] = [];
      const closedActionLabels: Partial<Record<Status, string>> = {
        done: "completed",
        rejected: "reported rejected",
        removed: "reported removed",
        cancelled: "cancelled",
      };

      posts.forEach((post) => {
        const postActorId = getActivityActorId(post.assigneeId);
        const postAssignee = getMemberName(team, postActorId);
        const postTime = post.assignedAt ?? post.createdAt;
        const subreddit = getSubredditName(post.subredditUrl);

        items.push({
          id: `post-assigned-${post.id}`,
          actorId: postActorId,
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
            actorId: postActorId,
            actorName: postAssignee,
            action: "tla7",
            createdAt: postTime,
            detail: post.title,
            kind: "post",
            subreddit,
            tone: "green",
          });
        }

        if (post.status === "done" || post.status === "rejected" || post.status === "removed" || post.status === "cancelled") {
          const actorId = getActivityActorId(post.deletedBy ?? post.assigneeId);
          items.push({
            id: `post-status-${post.id}-${post.status}`,
            actorId,
            actorName: getMemberName(team, actorId),
            action: `${closedActionLabels[post.status] ?? "updated"} a post task`,
            createdAt: post.deletedAt ?? postTime,
            detail: post.title,
            kind: "post",
            subreddit,
            tone: post.status === "done" ? "green" : "muted",
          });
        }

        post.comments.forEach((comment) => {
          const commentActorId = getActivityActorId(comment.assigneeId);
          const commentAssignee = getMemberName(team, commentActorId);
          const commentTime = comment.assignedAt ?? comment.createdAt;
          const commentDetail = comment.body.length > 96
            ? `${comment.body.slice(0, 96)}...`
            : comment.body;

          items.push({
            id: `comment-assigned-${comment.id}`,
            actorId: commentActorId,
            actorName: commentAssignee,
            action: comment.parentId ? "was assigned a reply task" : "was assigned a comment task",
            createdAt: commentTime,
            detail: commentDetail,
            kind: "comment",
            subreddit,
            tone: "yellow",
          });

          if (comment.status === "done" || comment.status === "rejected" || comment.status === "removed" || comment.status === "cancelled") {
            items.push({
              id: `comment-status-${comment.id}-${comment.status}`,
              actorId: commentActorId,
              actorName: commentAssignee,
              action: `${closedActionLabels[comment.status] ?? "updated"} a comment task`,
              createdAt: commentTime,
              detail: commentDetail,
              kind: "comment",
              subreddit,
              tone: comment.status === "done" ? "green" : "muted",
            });
          }
        });
      });

      return items
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 40);
    } else {
      // Parse real DB history items
      return dbHistory
        .map((row) => {
          const post = posts.find((p) => p.id === row.post_id);
          const comment = row.comment_id && post
            ? post.comments.find((candidate) => candidate.id === row.comment_id)
            : null;
          const actorId = getActivityActorId(
            row.actor_id ??
              row.new_assignee_id ??
              row.old_assignee_id ??
              comment?.assigneeId ??
              post?.assigneeId,
          );
          const actorName = getMemberName(team, actorId);
          const subreddit = post ? getSubredditName(post.subredditUrl) : "r/subreddit";
          
          let actionLabel = "";
          let tone: ActivityLogItem["tone"] = "muted";

          switch (row.event_type) {
            case "post_created":
              actionLabel = "created a new post assignment";
              tone = "accent";
              break;
            case "post_status_changed":
              actionLabel = `marked post status as ${row.new_status}`;
              tone = row.new_status === "done" ? "green" : "yellow";
              break;
            case "post_assignee_changed":
              const newAssignee = getMemberName(team, row.new_assignee_id || "");
              actionLabel = `reassigned post task to ${newAssignee}`;
              tone = "accent";
              break;
            case "post_soft_deleted":
              actionLabel = "cancelled post task";
              tone = "muted";
              break;
            case "comment_created":
              actionLabel = "added a comment assignment";
              tone = "yellow";
              break;
            case "comment_status_changed":
              actionLabel = `marked comment status as ${row.new_status}`;
              tone = row.new_status === "done" ? "green" : "yellow";
              break;
            case "comment_assignee_changed":
              const newCommentAssignee = getMemberName(team, row.new_assignee_id || "");
              actionLabel = `reassigned comment task to ${newCommentAssignee}`;
              tone = "yellow";
              break;
            case "comment_posted_url_changed":
              actionLabel = "pasted comment proof link";
              tone = "green";
              break;
            default:
              actionLabel = "updated task status";
              tone = "muted";
          }

          let detailText = post?.title || "Reddit Post";
          if (comment) {
            detailText = comment.body.length > 96
              ? `"${comment.body.slice(0, 96)}..."`
              : `"${comment.body}"`;
          }

          return {
            id: row.id,
            actorId,
            actorName,
            action: actionLabel,
            createdAt: row.created_at,
            detail: detailText,
            kind: row.entity_type,
            subreddit,
            tone,
          } as ActivityLogItem;
        })
        .filter(Boolean);
    }
  }, [adminMember?.id, historySource, dbHistory, posts, team]);

  function handleLogout() {
    window.localStorage.removeItem(SESSION_KEY);
    router.replace("/");
  }

  if (loading || !currentUser) {
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
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>
            Loading dashboard metrics
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <TopNav
        currentUser={currentUser}
        currentUserIndex={team.findIndex((m) => m.id === currentUser.id)}
        notifications={[]}
        pendingCount={0}
        onLogout={handleLogout}
        team={team}
      />

      {/* Hero section */}
      <section
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          padding: "24px 0",
        }}
      >
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px" }}>
          <div>
            <span style={{ fontSize: "0.76rem", fontWeight: 850, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Performance Desk
            </span>
            <h1 style={{ marginTop: "4px", fontSize: "1.45rem", fontWeight: 900, lineHeight: 1.2 }}>
              Home Analytics
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", marginTop: "5px" }}>
              Detailed metrics, leaderboard listings, and recent desk events.
            </p>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
        {/* Core Metrics Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          
          {/* Stats Card */}
          <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "128px" }}>
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 800, textTransform: "uppercase" }}>Assignments</p>
              <h3 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--text-primary)", marginTop: "4px" }}>
                {stats.totalTasks}
              </h3>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600 }}>
              {stats.totalPosts} posts • {stats.totalComments} comments
            </p>
          </div>

          {/* Completion Rate Card */}
          <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "128px", borderLeft: "4px solid var(--green)" }}>
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 800, textTransform: "uppercase" }}>Completion Rate</p>
              <h3 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--green)", marginTop: "4px" }}>
                {stats.completionRate}%
              </h3>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600 }}>
              {stats.totalCompleted} tasks completed successfully
            </p>
          </div>

          {/* Queue Card */}
          <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "128px", borderLeft: "4px solid var(--yellow)" }}>
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 800, textTransform: "uppercase" }}>mazal (Queued)</p>
              <h3 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--yellow)", marginTop: "4px" }}>
                {stats.queued}
              </h3>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600 }}>
              Pending task assignments
            </p>
          </div>

          {/* Rejected/Closed Card */}
          <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "128px", borderLeft: "4px solid var(--text-muted)" }}>
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.76rem", fontWeight: 800, textTransform: "uppercase" }}>Closed / Cancelled</p>
              <h3 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--text-secondary)", marginTop: "4px" }}>
                {stats.rejected + stats.removed + stats.cancelled}
              </h3>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600 }}>
              {stats.rejected} rejected • {stats.removed} removed • {stats.cancelled} cancelled
            </p>
          </div>
        </div>

        {/* Dashboard Content Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.9fr)", gap: "28px", alignItems: "start" }} className="dashboard-content-grid">
          
          {/* Leaderboard Column */}
          <section>
            <div className="glass-card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.01)" }}>
                <h2 style={{ fontSize: "0.96rem", fontWeight: 850 }}>Teammate Leaderboard</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 600, marginTop: "2px" }}>
                  Ranked by finished task assignments.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {leaderboard.map((member, index) => {
                  const getMedal = (rank: number) => {
                    if (rank === 0) return "🥇";
                    if (rank === 1) return "🥈";
                    if (rank === 2) return "🥉";
                    return `#${rank + 1}`;
                  };

                  const isTopThree = index < 3;

                  return (
                    <div
                      key={member.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 20px",
                        borderBottom: index === leaderboard.length - 1 ? "none" : "1px solid var(--border)",
                        background: member.id === currentUser.id ? "rgba(255, 69, 0, 0.03)" : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <span style={{ 
                          fontSize: isTopThree ? "1.1rem" : "0.74rem", 
                          fontWeight: 900, 
                          color: isTopThree ? "inherit" : "var(--text-muted)",
                          minWidth: "22px",
                          textAlign: "center"
                        }}>
                          {getMedal(index)}
                        </span>
                        <Avatar member={member} size={36} index={index} />
                        <div style={{ minWidth: 0 }}>
                          <h4 style={{ fontSize: "0.84rem", fontWeight: 850, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {member.name} {member.id === currentUser.id && <span style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 700 }}>(You)</span>}
                          </h4>
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 700 }}>
                            {member.totalPending} pending tasks
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "1.15rem", fontWeight: 900, color: member.totalCompleted > 0 ? "var(--green)" : "var(--text-muted)" }}>
                          {member.totalCompleted}
                        </span>
                        <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 800, textTransform: "uppercase" }}>Done</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Recent Activity Column */}
          <section>
            <div className="glass-card" style={{ overflow: "hidden" }}>
              <div style={{ 
                padding: "16px 20px", 
                borderBottom: "1px solid var(--border)", 
                background: "rgba(255,255,255,0.01)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px"
              }}>
                <div>
                  <h2 style={{ fontSize: "0.96rem", fontWeight: 850 }}>Recent Activity</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 600, marginTop: "2px" }}>
                    Chronological list of updates across the desk.
                  </p>
                </div>
                
                {/* Source Pill */}
                <span style={{ 
                  fontSize: "0.66rem", 
                  fontWeight: 900, 
                  textTransform: "uppercase", 
                  padding: "3px 8px", 
                  borderRadius: "999px",
                  background: historySource === "database" ? "var(--green-dim)" : "var(--accent-dim)",
                  color: historySource === "database" ? "var(--green)" : "var(--accent)",
                  border: `1px solid ${historySource === "database" ? "rgba(34,197,94,0.2)" : "rgba(255,69,0,0.2)"}`
                }}>
                  {historySource === "database" ? "Live DB Feed" : "Legacy DB Fallback"}
                </span>
              </div>

              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px", maxHeight: "640px", overflowY: "auto" }}>
                {activityList.length === 0 ? (
                  <p style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: 700 }}>
                    No actions logged on this desk yet.
                  </p>
                ) : (
                  activityList.map((item) => {
                    const actorMember = team.find(m => m.id === item.actorId) || adminMember;
                    const toneColors = {
                      accent: "var(--accent)",
                      green: "var(--green)",
                      yellow: "var(--yellow)",
                      red: "var(--red)",
                      muted: "var(--text-muted)"
                    };

                    return (
                      <div key={item.id} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                        <div style={{ marginTop: "2px" }}>
                          {actorMember && <Avatar member={actorMember} size={30} fontSize="0.65rem" />}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 850, color: "var(--text-primary)" }}>
                              {item.actorName}
                            </span>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                              {item.action}
                            </span>
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 700, marginLeft: "auto", flexShrink: 0 }}>
                              {timeAgo(item.createdAt)}
                            </span>
                          </div>

                          <p style={{ 
                            marginTop: "4px", 
                            fontSize: "0.78rem", 
                            color: "var(--text-muted)", 
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}>
                            {item.subreddit} • {item.detail}
                          </p>
                        </div>

                        {/* Dot indicator */}
                        <span 
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: toneColors[item.tone] || "var(--text-muted)",
                            marginTop: "6px",
                            flexShrink: 0
                          }}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </section>

      <style>{`
        @media (max-width: 840px) {
          .dashboard-content-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
