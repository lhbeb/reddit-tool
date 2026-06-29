const fs = require('fs');
let c = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8');

// Target 1 (around line 1400)
const target1 = `<div className="member-task-header">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", alignItems: "center", minWidth: 0 }}>
                    <span style={{ fontWeight: 850, fontSize: "0.78rem", color: "var(--accent)" }}>
                      {getSubredditName(task.subredditUrl)}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        background: isPostTask ? "var(--accent-dim)" : "var(--indigo-dim)",
                        color: isPostTask ? "#ff7043" : "var(--indigo)",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontWeight: 850,
                      }}
                    >
                      {isPostTask ? "Post task" : "Comment task"}
                    </span>
                    {!isPostTask && task.isAiDraft && <AiDraftBadge />}
                    <TeamMemberChip compact memberId={task.assigneeId} team={team} />
                  </div>
                  <StatusPill status={task.status} />
                </div>`;

const replace1 = `<div className="member-task-header">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", alignItems: "center", minWidth: 0 }}>
                    <TeamMemberChip compact memberId={task.assigneeId} team={team} />
                    <span style={{ fontWeight: 850, fontSize: "0.78rem", color: "var(--accent)" }}>
                      {getSubredditName(task.subredditUrl)}
                    </span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        background: isPostTask ? "var(--accent-dim)" : "var(--indigo-dim)",
                        color: isPostTask ? "#ff7043" : "var(--indigo)",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontWeight: 850,
                      }}
                    >
                      {isPostTask ? "Post task" : "Comment task"}
                    </span>
                    {!isPostTask && task.isAiDraft && <AiDraftBadge />}
                  </div>
                  <StatusPill status={task.status} />
                </div>`;

c = c.replace(target1, replace1);

// Target 2 (around line 1595)
// It's literally identical code!
c = c.replace(target1, replace1);

fs.writeFileSync('src/components/reddit/task-components.tsx', c);
console.log('Moved TeamMemberChip to top left');
