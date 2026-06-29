const fs = require('fs');
let c = fs.readFileSync('src/lib/helpers.ts', 'utf-8');

const newFunc = `
export function getAvatarUrl(slug: string): string | null {
  if (slug === 'mehdi') return '/mehdi-admin.jpeg';
  const knownSlugs = ['abdo', 'janah', 'jebbar', 'walid', 'yassine'];
  if (knownSlugs.includes(slug)) return \`/\${slug}.jpeg\`;
  return null;
}
`;

c += newFunc;
fs.writeFileSync('src/lib/helpers.ts', c);
console.log("Added getAvatarUrl");
