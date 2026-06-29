const fs = require('fs');

const content = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8');
const lines = content.split('\n');

// Keep up to line 734 (index 733) and everything from line 780 (index 779) onwards
const newLines = [
  ...lines.slice(0, 734),
  ...lines.slice(779)
];

fs.writeFileSync('src/components/reddit/task-components.tsx', newLines.join('\n'));
console.log('Removed duplicate code chunk');
