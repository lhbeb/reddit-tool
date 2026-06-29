const fs = require('fs');

const lines = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8').split('\n');

const replacement = `          <Image
            src="/reddit-1.svg"
            alt="Reddit logo"
            width={80}
            height={28}
            className="h-6 w-auto"
            style={{
              filter:
                "brightness(0) saturate(100%) invert(38%) sepia(99%) saturate(700%) hue-rotate(353deg) brightness(100%) contrast(102%)",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-bright)",
            borderRadius: "999px",
            padding: "4px 12px 4px 4px",
          }}
        >
          <Avatar member={currentUser} size={28} fontSize="0.65rem" index={currentUserIndex} />
          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{currentUser.name}</span>
        </div>`;

const newLines = [
  ...lines.slice(0, 576),
  replacement,
  ...lines.slice(589)
];

fs.writeFileSync('src/components/reddit/task-components.tsx', newLines.join('\n'));
console.log('Fixed TopNav via slice');
