const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf-8');

const toast_ui = `
      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          backgroundColor: "var(--foreground)",
          color: "var(--background)",
          padding: "12px 24px",
          borderRadius: "8px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
          fontWeight: 600,
          zIndex: 9999,
          animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards"
        }}>
          {toastMessage}
        </div>
      )}
    </main>
  );
}`;

content = content.replace(/ {4}<\/main>\r?\n  \);\r?\n\}/, toast_ui);

fs.writeFileSync('src/app/page.tsx', content, 'utf-8');
console.log("Added toast UI");
