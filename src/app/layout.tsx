import type { Metadata } from "next";
import "./globals.css";
import ActiveProcesses from "@/components/ActiveProcesses";
import { ThemeProvider } from "@/components/ThemeProvider";
import AutoCleanup from "@/components/AutoCleanup";

export const metadata: Metadata = {
  title: "Claude Hub - Session Manager",
  description: "Manage and browse your Claude Code sessions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('claude-hub-theme');
                  if (theme === 'light' || theme === 'dark') {
                    document.documentElement.classList.add(theme);
                  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <ThemeProvider>
          {children}
          <ActiveProcesses />
          <AutoCleanup />
        </ThemeProvider>
      </body>
    </html>
  );
}
