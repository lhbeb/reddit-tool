const fs = require('fs');

let c = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8');

c = c.replace(
  '<Avatar member={member} size={compact ? 20 : 24} fontSize={compact ? "0.58rem" : "0.62rem"} index={colorIndex} />',
  '<Avatar member={member} size={compact ? 24 : 32} fontSize={compact ? "0.65rem" : "0.8rem"} index={colorIndex} />'
);

fs.writeFileSync('src/components/reddit/task-components.tsx', c);
console.log('Increased avatar size');
