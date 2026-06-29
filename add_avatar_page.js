const fs = require('fs');

let c = fs.readFileSync('src/app/page.tsx', 'utf-8');

c = c.replace('TopNav,', 'TopNav,\n  Avatar,');

const target = `<span
                      style={{
                        flexShrink: 0,
                        width: "34px",
                        height: "34px",
                        borderRadius: "50%",
                        background: avatarColor(index),
                        display: "grid",
                        placeItems: "center",
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        color: "#fff",
                      }}
                    >
                      {initials(member.name)}
                    </span>`;

c = c.replace(target, '<Avatar member={member} size={34} fontSize="0.7rem" index={index} />');

fs.writeFileSync('src/app/page.tsx', c);
console.log('Replaced avatar in page.tsx');
