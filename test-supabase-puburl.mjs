import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://iaoupmqazoptmwtqmwlb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhb3VwbXFhem9wdG13dHFtd2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjQyNTIsImV4cCI6MjA5Nzc0MDI1Mn0.uEIJFYEbMIdpj1pWtcVyLmlpiDnsqbyn5rn2dF7Kuhw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data: errorTest, error: err1 } = await supabase.from('reddit_posts').select(`
        id, title, post_body, subreddit_url, published_url,
        assignee_id, status, created_at,
        reddit_comments (
          id, body, assignee_id, status, created_at
        )
      `);
  console.log("With published_url error:", err1?.message);

  const { data: noPubTest, error: err2 } = await supabase.from('reddit_posts').select(`
        id, title, post_body, subreddit_url,
        assignee_id, status, created_at,
        reddit_comments (
          id, body, assignee_id, status, created_at
        )
      `);
  console.log("Without published_url error:", err2?.message);
}
check();
