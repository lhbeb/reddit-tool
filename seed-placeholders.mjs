import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://iaoupmqazoptmwtqmwlb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhb3VwbXFhem9wdG13dHFtd2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjQyNTIsImV4cCI6MjA5Nzc0MDI1Mn0.uEIJFYEbMIdpj1pWtcVyLmlpiDnsqbyn5rn2dF7Kuhw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  const postsData = [
    {
      title: "Is this the best way to manage state in React?",
      post_body: "I have been using Redux for a while, but Zustand seems much simpler. Thoughts?",
      subreddit_url: "https://reddit.com/r/reactjs",
      status: "queued"
    },
    {
      title: "Just bought my first mechanical keyboard!",
      post_body: "Got a Keychron Q1 and I am loving the thocky sound. Any keycap recommendations?",
      subreddit_url: "https://reddit.com/r/MechanicalKeyboards",
      status: "queued"
    },
    {
      title: "What are your top 5 Sci-Fi books of all time?",
      post_body: "I just finished Dune and loved it. Looking for more recommendations.",
      subreddit_url: "https://reddit.com/r/printSF",
      status: "queued"
    },
    {
      title: "New to running, how do I avoid shin splints?",
      post_body: "Started running last week but my shins hurt. Any advice on form or shoes?",
      subreddit_url: "https://reddit.com/r/running",
      status: "queued"
    }
  ];

  console.log("Inserting placeholder posts...");
  const { data: posts, error: postsError } = await supabase
    .from('reddit_posts')
    .insert(postsData)
    .select('id, title');

  if (postsError) {
    console.error("Error inserting posts:", postsError);
    return;
  }

  console.log("Successfully inserted posts:", posts);

  const commentsData = [];
  
  for (const post of posts) {
    let commentBody = "";
    if (post.title.includes("React")) {
      commentBody = "Zustand is fantastic! I switched to it a year ago and haven't looked back.";
    } else if (post.title.includes("keyboard")) {
      commentBody = "Check out the GMK sets if you have the budget, otherwise Akko has great budget options.";
    } else if (post.title.includes("Sci-Fi")) {
      commentBody = "You have to read The Expanse series. It's incredible!";
    } else if (post.title.includes("running")) {
      commentBody = "Make sure you are not overstriding! And definitely go to a running store to get fitted for shoes.";
    } else {
      commentBody = "Great post, thanks for sharing!";
    }

    commentsData.push({
      post_id: post.id,
      body: commentBody,
      status: "queued"
    });
  }

  console.log("Inserting thread comments...");
  const { data: comments, error: commentsError } = await supabase
    .from('reddit_comments')
    .insert(commentsData)
    .select('id, body');

  if (commentsError) {
    console.error("Error inserting comments:", commentsError);
    return;
  }

  console.log("Successfully inserted comments:", comments);
}

seed();
