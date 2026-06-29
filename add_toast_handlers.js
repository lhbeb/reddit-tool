const fs = require('fs');
let c = fs.readFileSync('src/app/page.tsx', 'utf-8');

c = c.replace(
  'await updatePost(task.postId, { publishedUrl: clean, status: "done" });',
  'await updatePost(task.postId, { publishedUrl: clean, status: "done" });\n    showToast("Post task marked as done!");'
);

c = c.replace(
  'await updateComment(task.commentId, { status: "done", posted_url: clean });',
  'await updateComment(task.commentId, { status: "done", posted_url: clean });\n    showToast("Comment task marked as done!");'
);

fs.writeFileSync('src/app/page.tsx', c);
console.log("Added toast handlers");
