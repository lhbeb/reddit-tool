import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://iaoupmqazoptmwtqmwlb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhb3VwbXFhem9wdG13dHFtd2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjQyNTIsImV4cCI6MjA5Nzc0MDI1Mn0.uEIJFYEbMIdpj1pWtcVyLmlpiDnsqbyn5rn2dF7Kuhw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('reddit_comments').select('*').limit(1);
  console.log("Comments columns check. Error:", error, "Data:", data);
}
check();
