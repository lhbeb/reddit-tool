const fs = require('fs');

/* ================================================================
   STEP 1 — Fix task-grid: 3 columns
   ================================================================ */
let page = fs.readFileSync('src/app/page.tsx', 'utf8').replace(/\r\n/g, '\n');

const OLD_GRID_CSS = `.task-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
            gap: 18px;
            align-items: start;
          }`;

const NEW_GRID_CSS = `.task-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            align-items: start;
          }
          @media (max-width: 900px) {
            .task-grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 600px) {
            .task-grid { grid-template-columns: 1fr; }
          }`;

if (page.includes(OLD_GRID_CSS)) {
  page = page.replace(OLD_GRID_CSS, NEW_GRID_CSS);
  console.log('✓ 3-column grid');
} else {
  console.error('✗ task-grid not found');
}

fs.writeFileSync('src/app/page.tsx', page);

/* ================================================================
   STEP 2-5 — Rewrite TaskSection card content
   ================================================================ */
let comp = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf8').replace(/\r\n/g, '\n');

// ── Remove subreddit "r/" duplication bug ──
// Currently code does: r/{getSubredditName(...)} and getSubredditName adds no r/
// BUT getSubredditName might return "r/subreddit" already. Let's check by replacing
// the display span - always use getSubredditName() without prefix, clean display.
// The span in the card header:
const OLD_SUB_SPAN = `                    <span style={{
                      fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)",
                      background: "var(--accent-dim)", borderRadius: "6px", padding: "2px 7px",
                    }}>
                      r/{getSubredditName(task.subredditUrl)}
                    </span>`;

const NEW_SUB_SPAN = `                    <span style={{
                      fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)",
                      background: "var(--accent-dim)", borderRadius: "6px", padding: "2px 7px",
                    }}>
                      {getSubredditName(task.subredditUrl)}
                    </span>`;

if (comp.includes(OLD_SUB_SPAN)) {
  comp = comp.replace(OLD_SUB_SPAN, NEW_SUB_SPAN);
  console.log('✓ Fixed r/ duplication');
} else {
  console.error('✗ subreddit span not found');
}

// ── MAIN CARD REWRITE: remove step indicator, action labels, problem label ──
const OLD_BODY = `                {/* ── Step indicator ── */}
                <MemberTaskFlow task={task} team={team} />

                {/* ── Reply-under context ── */}
                {!isPostTask && task.parentCommentBody && (
                  <div style={{
                    marginTop: "10px",
                    borderLeft: "2px solid var(--yellow)",
                    paddingLeft: "10px",
                  }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Reply under
                    </p>
                    <p style={{
                      marginTop: "3px",
                      color: "var(--text-secondary)",
                      fontSize: "0.78rem",
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {task.parentCommentBody}
                    </p>
                  </div>
                )}

                {/* ── Task body text ── */}
                <p style={{
                  marginTop: "12px",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.83rem",
                  lineHeight: 1.65,
                  color: "var(--text-secondary)",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {task.body}
                </p>

                {/* ── Action panel ── */}
                <div style={{
                  marginTop: "14px",
                  paddingTop: "14px",
                  borderTop: "1px solid var(--border)",
                }}>
                  {/* Action label */}
                  <p style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {actionTitle}
                  </p>
                  <p style={{ marginTop: "3px", fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {actionHelp}
                  </p>

                  {/* Action buttons */}
                  <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                    {isPostTask ? (
                      <>
                        <input
                          value={proofValue}
                          onChange={(e) => onPostProofChange(task.postId, e.target.value)}
                          placeholder="https://reddit.com/r/.../comments/..."
                          className="input"
                          disabled={isDone}
                          style={{ height: "38px", fontSize: "0.8rem", flex: "1 1 0", minWidth: "160px" }}
                        />
                        {!isDone ? (
                          <button
                            type="button"
                            onClick={() => onCompletePostTask(task, proofValue)}
                            disabled={!proofReady}
                            className="btn-primary"
                            style={{ height: "38px", padding: "0 18px", borderRadius: "8px", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            Mark done ✓
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onStatusChange(task, "queued")}
                            className="btn-ghost"
                            style={{ height: "38px", padding: "0 14px", borderRadius: "8px", fontSize: "0.78rem" }}
                          >
                            Undo
                          </button>
                        )}
                        {postLinkReady && task.publishedUrl && (
                          <a href={task.publishedUrl} target="_blank" rel="noreferrer" className="btn-dark"
                            style={{ height: "38px", padding: "0 12px", borderRadius: "8px", fontSize: "0.76rem", display: "inline-flex", alignItems: "center" }}>
                            ↗ View post
                          </a>
                        )}
                      </>
                    ) : task.isAiDraft && !postLinkReady ? (
                      <>
                        <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                          style={{ height: "38px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                          {copiedLinkId === commentCopyId ? "✓ Copied" : "Copy comment"}
                        </button>
                        <span style={{ color: "var(--yellow)", fontSize: "0.75rem", fontWeight: 800 }}>
                          ⏳ Waiting for post link
                        </span>
                      </>
                    ) : postLinkReady && task.publishedUrl ? (
                      <>
                        <a href={task.publishedUrl} target="_blank" rel="noreferrer" className="btn-dark"
                          style={{ height: "38px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center" }}>
                          ↗ Open post
                        </a>
                        <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                          style={{ height: "38px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                          {copiedLinkId === commentCopyId ? "✓ Copied" : "Copy comment"}
                        </button>
                        {!isDone && (
                          <button type="button" onClick={() => onStatusChange(task, "done")} className="btn-primary"
                            style={{ height: "38px", padding: "0 18px", borderRadius: "8px", fontSize: "0.8rem" }}>
                            Mark done ✓
                          </button>
                        )}
                        {isDone && (
                          <button type="button" onClick={() => onStatusChange(task, "queued")} className="btn-ghost"
                            style={{ height: "38px", padding: "0 14px", borderRadius: "8px", fontSize: "0.78rem" }}>
                            Undo
                          </button>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--yellow)", fontSize: "0.78rem", fontWeight: 800 }}>
                        ⏳ Waiting for post link
                      </span>
                    )}
                  </div>

                  {/* Problem buttons - subtle, at the bottom */}
                  {!isDone && (
                    <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>Problem?</span>
                      <button type="button" onClick={() => onStatusChange(task, "rejected")}
                        style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", borderRadius: "6px", padding: "2px 10px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}>
                        Rejected
                      </button>
                      <button type="button" onClick={() => onStatusChange(task, "removed")}
                        style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "6px", padding: "2px 10px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}>
                        Removed
                      </button>
                    </div>
                  )}
                </div>`;

const NEW_BODY = `                {/* ── Reply-under context (comment tasks only) ── */}
                {!isPostTask && task.parentCommentBody && (
                  <p style={{
                    marginTop: "8px",
                    fontSize: "0.73rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.4,
                    borderLeft: "2px solid var(--yellow)",
                    paddingLeft: "8px",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {task.parentCommentBody}
                  </p>
                )}

                {/* ── Task body text ── */}
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

                {/* ── Action panel ── */}
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  {isPostTask ? (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        value={proofValue}
                        onChange={(e) => onPostProofChange(task.postId, e.target.value)}
                        placeholder="Paste Reddit post link…"
                        className="input"
                        disabled={isDone}
                        style={{ height: "36px", fontSize: "0.8rem", flex: "1 1 0", minWidth: 0 }}
                      />
                      {!isDone ? (
                        <button
                          type="button"
                          onClick={() => onCompletePostTask(task, proofValue)}
                          disabled={!proofReady}
                          className="btn-primary"
                          style={{ height: "36px", padding: "0 14px", borderRadius: "8px", whiteSpace: "nowrap", flexShrink: 0, fontSize: "0.8rem" }}
                        >
                          Done ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStatusChange(task, "queued")}
                          className="btn-ghost"
                          style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.78rem", flexShrink: 0 }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  ) : task.isAiDraft && !postLinkReady ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                        style={{ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        {copiedLinkId === commentCopyId ? "✓ Copied" : "Copy comment"}
                      </button>
                      <span style={{ color: "var(--yellow)", fontSize: "0.75rem", fontWeight: 800 }}>⏳ Waiting for post</span>
                    </div>
                  ) : postLinkReady && task.publishedUrl ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <a href={task.publishedUrl} target="_blank" rel="noreferrer" className="btn-dark"
                        style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.8rem", display: "inline-flex", alignItems: "center" }}>
                        ↗ Open post
                      </a>
                      <button type="button" onClick={() => onCopyLink(commentCopyId, task.body)} className="btn-ghost"
                        style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        {copiedLinkId === commentCopyId ? "✓ Copied" : "Copy"}
                      </button>
                      {!isDone && (
                        <button type="button" onClick={() => onStatusChange(task, "done")} className="btn-primary"
                          style={{ height: "36px", padding: "0 14px", borderRadius: "8px", fontSize: "0.8rem" }}>
                          Done ✓
                        </button>
                      )}
                      {isDone && (
                        <button type="button" onClick={() => onStatusChange(task, "queued")} className="btn-ghost"
                          style={{ height: "36px", padding: "0 12px", borderRadius: "8px", fontSize: "0.78rem" }}>
                          Undo
                        </button>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--yellow)", fontSize: "0.78rem", fontWeight: 800 }}>⏳ Waiting for post link</span>
                  )}

                  {/* Problem links — tiny, unobtrusive, bottom right */}
                  {!isDone && (
                    <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button type="button" onClick={() => onStatusChange(task, "rejected")}
                        style={{ background: "none", border: "none", color: "#f87171", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", padding: 0, opacity: 0.7 }}>
                        Rejected
                      </button>
                      <button type="button" onClick={() => onStatusChange(task, "removed")}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", padding: 0, opacity: 0.7 }}>
                        Removed
                      </button>
                    </div>
                  )}
                </div>`;

if (comp.includes(OLD_BODY)) {
  comp = comp.replace(OLD_BODY, NEW_BODY);
  console.log('✓ Rewrote card body (removed clutter, fixed action area, collapsed problem row)');
} else {
  console.error('✗ OLD_BODY not matched');
}

// ── Fix member-task-card padding to be tighter ──
const OLD_CARD_STYLE = `            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 0;
            background: var(--bg-card);
            border: 1px solid var(--border-bright);
            border-left: 3px solid var(--task-accent);
            border-radius: 12px;
            padding: 16px 18px 18px;
            overflow: hidden;
            transition: border-color 150ms ease, box-shadow 150ms ease;`;

const NEW_CARD_STYLE = `            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 0;
            background: var(--bg-card);
            border: 1px solid var(--border-bright);
            border-left: 3px solid var(--task-accent);
            border-radius: 12px;
            padding: 14px 16px 14px;
            overflow: hidden;
            transition: border-color 150ms ease, box-shadow 150ms ease;`;

if (comp.includes(OLD_CARD_STYLE)) {
  comp = comp.replace(OLD_CARD_STYLE, NEW_CARD_STYLE);
  console.log('✓ Tightened card padding');
} else {
  console.log('(card padding pattern not found — skipping)');
}

fs.writeFileSync('src/components/reddit/task-components.tsx', comp);
console.log('\nAll done.');
