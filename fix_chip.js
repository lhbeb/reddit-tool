const fs = require('fs');

const content = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8');
const lines = content.split('\n');

const start = lines.findIndex(l => l.includes('export function TeamMemberChip'));
const end = lines.findIndex((l, i) => i > start && l.startsWith('}'));

const newChip = `export function TeamMemberChip({
  compact = false,
  label,
  memberId,
  team,
}: {
  compact?: boolean;
  label?: string;
  memberId: string;
  team: TeamMember[];
}) {
  const memberIndex = team.findIndex((member) => member.id === memberId);
  const colorIndex = memberIndex >= 0 ? memberIndex : 0;
  const name = getMemberName(team, memberId);
  const member = team.find((m) => m.id === memberId) || team[0];

  if (compact) {
    return <Avatar member={member} size={42} fontSize="1.1rem" index={colorIndex} />;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        borderRadius: "999px",
        padding: "4px 10px 4px 4px",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      {label && (
        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 800 }}>
          {label}
        </span>
      )}
      <Avatar member={member} size={32} fontSize="0.8rem" index={colorIndex} />
      <span
        style={{
          color: "var(--text-primary)",
          fontSize: "0.78rem",
          fontWeight: 800,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </span>
  );
}`;

const newLines = [...lines.slice(0, start), newChip, ...lines.slice(end + 1)];
fs.writeFileSync('src/components/reddit/task-components.tsx', newLines.join('\n'));
console.log('Replaced TeamMemberChip');
