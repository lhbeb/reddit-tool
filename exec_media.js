const fs = require('fs');

let page = fs.readFileSync('src/app/page.tsx', 'utf8').replace(/\r\n/g, '\n');

// 1. Add mediaFile state
const STATE_INJECTION = `  const [postDraft, setPostDraft] = useState({
    title: "",
    postBody: "",
    subredditUrl: "",
    assigneeId: "",
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);`;

page = page.replace(`  const [postDraft, setPostDraft] = useState({
    title: "",
    postBody: "",
    subredditUrl: "",
    assigneeId: "",
  });`, STATE_INJECTION);

// 2. Update handleCreatePost to upload file
const OLD_CREATE_POST = `    setIsSubmittingPost(true);
    try {
      const insertPayload: Record<string, string | null> = {
        title: postDraft.title.trim(),
        post_body: postDraft.postBody.trim(),
        subreddit_url: postDraft.subredditUrl.trim() || null,
        assignee_id: assigneeId,
        status: "queued",
      };`;

const NEW_CREATE_POST = `    setIsSubmittingPost(true);
    try {
      let finalBody = postDraft.postBody.trim();

      if (mediaFile) {
        const formData = new FormData();
        formData.append("file", mediaFile);
        try {
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (data.success && data.url) {
            finalBody += \`\\n\\n[MEDIA:\${data.url}]\`;
          }
        } catch (err) {
          console.error("Failed to upload media:", err);
        }
      }

      const insertPayload: Record<string, string | null> = {
        title: postDraft.title.trim(),
        post_body: finalBody,
        subreddit_url: postDraft.subredditUrl.trim() || null,
        assignee_id: assigneeId,
        status: "queued",
      };`;

page = page.replace(OLD_CREATE_POST, NEW_CREATE_POST);

// 3. Clear mediaFile on success
const OLD_CLEAR = `      setPostDraft({ title: "", postBody: "", subredditUrl: "", assigneeId: assigneeId });
      setPostError("");`;

const NEW_CLEAR = `      setPostDraft({ title: "", postBody: "", subredditUrl: "", assigneeId: assigneeId });
      setMediaFile(null);
      setPostError("");`;

page = page.replace(OLD_CLEAR, NEW_CLEAR);

// 4. Add file input to form
const OLD_BODY_FIELD = `              </Field>
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
              <Field label="Subreddit link">`;

const NEW_BODY_FIELD = `              </Field>
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
              <Field label="Attach Media (optional)">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                  className="input"
                  style={{ padding: "8px" }}
                />
              </Field>
              <Field label="Subreddit link">`;

page = page.replace(OLD_BODY_FIELD, NEW_BODY_FIELD);

// 5. Parse media tag out of post.postBody in allTeamTasks
const OLD_MAPPING = `        const postTask: AssignedTask = {
          id: post.id,
          kind: "post",
          title: post.title,
          body: post.postBody,
          subredditUrl: post.subredditUrl,
          publishedUrl: post.publishedUrl,
          assigneeId: post.assigneeId,
          postAssigneeId: post.assigneeId,
          commentAssigneeIds,
          status: post.softDeleted ? "cancelled" : post.status,
          createdAt: post.createdAt,
          postId: post.id,
          postSoftDeleted: post.softDeleted,
        };`;

const NEW_MAPPING = `        const mediaMatch = post.postBody.match(/\\[MEDIA:(.+?)\\]/);
        const mediaUrl = mediaMatch ? mediaMatch[1] : undefined;
        const cleanBody = post.postBody.replace(/\\[MEDIA:.+?\\]/, '').trim();

        const postTask: AssignedTask = {
          id: post.id,
          kind: "post",
          title: post.title,
          body: cleanBody,
          mediaUrl,
          subredditUrl: post.subredditUrl,
          publishedUrl: post.publishedUrl,
          assigneeId: post.assigneeId,
          postAssigneeId: post.assigneeId,
          commentAssigneeIds,
          status: post.softDeleted ? "cancelled" : post.status,
          createdAt: post.createdAt,
          postId: post.id,
          postSoftDeleted: post.softDeleted,
        };`;

page = page.replace(OLD_MAPPING, NEW_MAPPING);

fs.writeFileSync('src/app/page.tsx', page);

// ── Update task-components.tsx to show download link
let comp = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf8').replace(/\r\n/g, '\n');

const OLD_CARD_BODY = `                {/* ── Task body text ── */}
                <p style={{
                  marginTop: "8px",
                  fontSize: "0.82rem",
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {task.body}
                </p>

                {/* ── Action panel ── */}`;

const NEW_CARD_BODY = `                {/* ── Task body text ── */}
                <p style={{
                  marginTop: "8px",
                  fontSize: "0.82rem",
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {task.body}
                </p>
                
                {/* ── Media Attachment ── */}
                {task.mediaUrl && (
                  <div style={{ marginTop: "10px" }}>
                    <a
                      href={task.mediaUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="btn-dark"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        textDecoration: "none"
                      }}
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Media
                    </a>
                  </div>
                )}

                {/* ── Action panel ── */}`;

comp = comp.replace(OLD_CARD_BODY, NEW_CARD_BODY);

fs.writeFileSync('src/components/reddit/task-components.tsx', comp);

console.log('✓ Script executed successfully.');
