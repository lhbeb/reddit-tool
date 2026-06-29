const fs = require('fs');

let c = fs.readFileSync('src/components/reddit/task-components.tsx', 'utf-8');

const target = `<Image
            src="/reddit-1.svg"
            alt="Reddit logo"
              fontSize: "0.65rem",
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {initials(currentUser.name)}
          </span>
          <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{currentUser.name}</span>
        </div>`;

const replacement = `<Image
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

c = c.replace(target, replacement);

fs.writeFileSync('src/components/reddit/task-components.tsx', c);
console.log("Fixed TopNav");
