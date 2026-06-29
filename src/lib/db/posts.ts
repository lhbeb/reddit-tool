import { dbPostToApp } from "@/lib/db/mappers";
import { formatSupabaseError } from "@/lib/db/errors";
import { supabase } from "@/lib/supabase";
import type { DbPostRow, RedditPost, SupabaseSelectPlan } from "@/lib/types";

const POST_SELECT_PLANS: SupabaseSelectPlan[] = [
  {
    label: "lifecycle",
    query: `
      id, title, post_body, subreddit_url, published_url,
      assignee_id, status, created_at,
      soft_deleted, deleted_at, deleted_by, rejection_reason, assigned_at,
      reddit_comments (
        id, body, assignee_id, status, created_at, parent_id,
        is_ai_draft, posted_url, assigned_at
      )
    `,
  },
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

let postSelectPlanIndex = 0;

export async function loadRedditPosts(): Promise<RedditPost[]> {
  let lastError: unknown = null;
  const preferredPlan = POST_SELECT_PLANS[0];
  const cachedPlans = [
    ...POST_SELECT_PLANS.slice(postSelectPlanIndex),
    ...POST_SELECT_PLANS.slice(0, postSelectPlanIndex),
  ];
  const orderedPlans =
    postSelectPlanIndex === 0
      ? cachedPlans
      : [preferredPlan, ...cachedPlans.filter((plan) => plan.label !== preferredPlan.label)];

  for (const plan of orderedPlans) {
    const { data, error } = await supabase
      .from("reddit_posts")
      .select(plan.query)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const nextIndex = POST_SELECT_PLANS.findIndex((candidate) => candidate.label === plan.label);
      if (nextIndex >= 0) postSelectPlanIndex = nextIndex;
      return (data as unknown as DbPostRow[]).map(dbPostToApp);
    }

    lastError = error;
  }

  console.error("[loadPosts] Supabase select error:", formatSupabaseError(lastError));
  return [];
}
