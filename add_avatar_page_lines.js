const fs = require('fs');
const lines = fs.readFileSync('src/app/page.tsx', 'utf-8').split('\n');

// The span we want to replace is from line 1762 to 1777 (1-indexed, so index 1761 to 1776)
const newLines = [
  ...lines.slice(0, 1761),
  '                    <Avatar member={member} size={34} fontSize="0.7rem" index={index} />',
  ...lines.slice(1777)
];

// We also need to import Avatar from task-components.tsx if not already imported
let content = newLines.join('\n');
if (!content.includes('Avatar,')) {
  content = content.replace('TopNav,', 'TopNav,\n  Avatar,');
}

fs.writeFileSync('src/app/page.tsx', content);
console.log('Replaced avatar by lines');
