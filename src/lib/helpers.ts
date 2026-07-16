import type {
  RedditPost,
  RedditComment,
  ScopeFilter,
  SortMode,
  Status,
  StatusFilter,
  TeamMember,
} from "@/lib/types";
import { STATUSES } from "@/lib/types";

// UI copy uses Moroccan Darija in Latin transliteration; keep task wording consistent.
export const statusLabels: Record<Status, string> = {
  queued: "mazal",
  working: "khddam 3liha",
  done: "salat",
  rejected: "trfd",
  removed: "t7ydat",
  cancelled: "tlgat",
};

export const sortLabels: Record<SortMode, string> = {
  newest: "ljdid louwel",
  oldest: "l9dim louwel",
  assignee: "7sab l'm3ayyen",
};

const AVATAR_COLORS = [
  "#ff4500",
  "#6c63ff",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#a855f7",
];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && STATUSES.includes(value as Status);
}

export function toStatus(value: unknown): Status {
  return isStatus(value) ? value : "queued";
}

export function isStatusFilter(value: unknown): value is StatusFilter {
  return value === "active" || value === "all" || isStatus(value);
}

export function isSortMode(value: unknown): value is SortMode {
  return value === "newest" || value === "oldest" || value === "assignee";
}

export function isScopeFilter(value: unknown): value is ScopeFilter {
  return value === "all" || value === "with-comments";
}

export function isClosedStatus(status: Status) {
  return status === "done" || status === "rejected" || status === "removed" || status === "cancelled";
}

export function isOpenStatus(status: Status) {
  return !isClosedStatus(status);
}

export function isSoftDeletedPost(post: Pick<RedditPost, "softDeleted">) {
  return Boolean(post.softDeleted);
}

export function isPostActive(post: Pick<RedditPost, "softDeleted" | "status" | "comments">) {
  return !isSoftDeletedPost(post) && (
    isOpenStatus(post.status) || post.comments.some((comment) => isOpenStatus(comment.status))
  );
}

export function getStatusGlowClass(status: Status) {
  if (status === "done") return "status-glow-done";
  if (status === "working") return "status-glow-working";
  if (status === "rejected" || status === "removed" || status === "cancelled") {
    return "status-glow-closed";
  }
  return "status-glow-queued";
}

export function getMemberName(team: TeamMember[], id: string) {
  return team.find((m) => m.id === id)?.name ?? team.find((m) => m.isAdmin)?.name ?? team[0]?.name ?? "Makhass 7ed";
}

export function getAssigneeList(team: TeamMember[], ids: string[]) {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return "Mazal ma t3ayyen 7ed";
  return unique.map((id) => getMemberName(team, id)).join(", ");
}

export function getCommentAssigneeIds(comments: RedditComment[]) {
  return Array.from(new Set(comments.map((c) => c.assigneeId))).filter(Boolean);
}

export function isUsableRedditLink(value?: string) {
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

export function getSubredditName(url: string) {
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

export function timeAgo(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "daba";

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 45) return "daba";

  const ranges: Array<[limit: number, divisor: number, unit: string]> = [
    [45 * 60, 60, "d9i9a"],
    [22 * 60 * 60, 60 * 60, "sa3a"],
    [25 * 24 * 60 * 60, 24 * 60 * 60, "nhar"],
    [345 * 24 * 60 * 60, 30 * 24 * 60 * 60, "chhar"],
    [Infinity, 365 * 24 * 60 * 60, "3am"],
  ];
  const [, divisor, unit] =
    ranges.find(([limit]) => absoluteSeconds < limit) ?? ranges[ranges.length - 1];
  const relativeValue = Math.round(absoluteSeconds / divisor);

  return seconds > 0 ? `ba9i ${relativeValue} ${unit}` : `mn ${relativeValue} ${unit}`;
}

export function getCommentDraftKey(postId: string, parentId?: string | null) {
  return parentId ? `${postId}:${parentId}` : postId;
}

export function getChildComments(comments: RedditComment[], parentId?: string | null) {
  return comments
    .filter((c) => (c.parentId ?? null) === (parentId ?? null))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getDescendantCommentCount(comments: RedditComment[], parentId: string): number {
  const children = getChildComments(comments, parentId);
  return children.reduce(
    (count, child) => count + 1 + getDescendantCommentCount(comments, child.id),
    0,
  );
}

export function avatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function getAvatarUrl(slug: string): string | null {
  if (slug === "mehdi") return "/mehdi-admin.jpeg";
  const knownSlugs = ["abdo", "amine", "janah", "jebbar", "walid", "yassine"];
  if (knownSlugs.includes(slug)) return `/${slug}.jpeg`;
  return null;
}
