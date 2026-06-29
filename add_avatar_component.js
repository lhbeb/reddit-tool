const fs = require('fs');

let c = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8');

const avatarComponent = `
export function Avatar({
  member,
  size = 24,
  fontSize = "0.62rem",
  index = 0,
}: {
  member: TeamMember;
  size?: number;
  fontSize?: string;
  index?: number;
}) {
  const url = getAvatarUrl(member.slug);
  const color = avatarColor(index);
  
  if (url) {
    return (
      <img
        src={url}
        alt={member.name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "grid",
        placeItems: "center",
        color: "#fff",
        fontSize: fontSize,
        fontWeight: 900,
        flexShrink: 0,
      }}
    >
      {initials(member.name)}
    </span>
  );
}
`;

// Insert after the imports
c = c.replace('} from "@/lib/types";', '} from "@/lib/types";\n' + avatarComponent);

// 1. Replace in TopNav
const topNavTarget = `<span
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: avatarColor(currentUserIndex),
              display: "grid",
              placeItems: "center",
              fontSize: "0.65rem",
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {initials(currentUser.name)}
          </span>`;

c = c.replace(topNavTarget, `<Avatar member={currentUser} size={28} fontSize="0.65rem" index={currentUserIndex} />`);

// 2. Replace in TeamMemberChip
const chipTarget = `<span
        aria-hidden="true"
        style={{
          width: compact ? "20px" : "24px",
          height: compact ? "20px" : "24px",
          borderRadius: "50%",
          background: avatarColor(colorIndex),
          display: "grid",
          placeItems: "center",
          color: "#fff",
          fontSize: compact ? "0.58rem" : "0.62rem",
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </span>`;

// Find TeamMemberChip to get the member object
// In TeamMemberChip, we already have: const memberIndex = team.findIndex...
c = c.replace('  const name = getMemberName(team, memberId);', '  const name = getMemberName(team, memberId);\n  const member = team.find((m) => m.id === memberId) || team[0];');

c = c.replace(chipTarget, `<Avatar member={member} size={compact ? 20 : 24} fontSize={compact ? "0.58rem" : "0.62rem"} index={colorIndex} />`);

fs.writeFileSync('src/components/reddit/task-components.tsx', c);
console.log("Replaced with Avatar component in task-components.tsx");
