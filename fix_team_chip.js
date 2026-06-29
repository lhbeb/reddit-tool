const fs = require('fs');
const lines = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8').split('\n');

const newLines = [
  ...lines.slice(0, 709),
  '      <Avatar member={member} size={compact ? 24 : 32} fontSize={compact ? "0.65rem" : "0.8rem"} index={colorIndex} />',
  ...lines.slice(726)
];

fs.writeFileSync('src/components/reddit/task-components.tsx', newLines.join('\n'));
console.log('Fixed TeamMemberChip');
