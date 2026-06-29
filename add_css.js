const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf-8');

const target = `          .member-task-card {
            --task-accent: var(--accent);
            --task-accent-soft: rgba(255,69,0,0.14);
            --task-border: rgba(255,69,0,0.34);
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 0;
            background:
              linear-gradient(180deg, var(--task-accent-soft), transparent 34%),
              var(--bg-card);
            border: 1px solid var(--task-border);
            border-left: 0 !important;
            border-radius: 12px;
            padding: 20px 18px 18px;
            overflow: hidden;
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.06),
              0 10px 24px rgba(0,0,0,0.22);
          }`;

const replacement = `          .member-task-card {
            --task-accent: var(--accent);
            --task-accent-soft: rgba(255,69,0,0.14);
            --task-border: rgba(255,69,0,0.34);
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 0;
            background:
              linear-gradient(180deg, var(--task-accent-soft), transparent 34%),
              var(--bg-card);
            border: 1px solid var(--task-border);
            border-left: 0 !important;
            border-radius: 12px;
            padding: 20px 18px 18px;
            overflow: hidden;
            box-shadow:
              inset 0 1px 0 rgba(255,255,255,0.06),
              0 10px 24px rgba(0,0,0,0.22);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          }

          .member-task-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 16px 32px rgba(0,0,0,0.35);
          }`;

content = content.replace(target, replacement);

// We also need to add the slideInRight keyframes
const targetKeyframes = `      <style jsx global>{\``;
const replacementKeyframes = `      <style jsx global>{\`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
`;

content = content.replace(targetKeyframes, replacementKeyframes);

fs.writeFileSync('src/app/page.tsx', content, 'utf-8');
console.log("CSS animations added.");
