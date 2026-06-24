import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://iaoupmqazoptmwtqmwlb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhb3VwbXFhem9wdG13dHFtd2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjQyNTIsImV4cCI6MjA5Nzc0MDI1Mn0.uEIJFYEbMIdpj1pWtcVyLmlpiDnsqbyn5rn2dF7Kuhw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log("Fetching posts without comments join...");
  const { data: posts1, error: err1 } = await supabase.from('reddit_posts').select('*');
  console.log("Posts count:", posts1?.length, "Error:", err1);
  if (posts1?.length > 0) console.log("First post:", posts1[0]);

  console.log("\nFetching posts with comments join...");
  const { data: posts2, error: err2 } = await supabase.from('reddit_posts').select(`
        id, title, post_body, subreddit_url, published_url,
        assignee_id, status, created_at,
        reddit_comments (
          id, body, assignee_id, status, created_at, parent_id
        )
      `);
  console.log("Joined Posts count:", posts2?.length, "Error:", err2);
}

check();
