import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata follows the same Moroccan Darija, Latin-transliteration UI language as the app.
export const metadata: Metadata = {
  title: "Tool dyal orchestration",
  description: "3ayyen lposts, l3nawin, links, w ta3ali9 dyal Reddit lfar9tk bser3a.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ary"
      className={`${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
