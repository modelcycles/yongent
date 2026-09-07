import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "./ThemeToggle";

export const metadata: Metadata = {
  title: "Yongent",
  description: "에이전트 대시보드",
};

// 하이드레이션 전에 테마를 적용해 깜빡임(FOUC) 방지. 기본은 다크.
const themeInit = `(function(){try{if(localStorage.getItem('theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-gray-950 text-gray-100 light:bg-gray-50 light:text-gray-900 min-h-screen transition-colors">
        <header className="flex items-center justify-between border-b border-gray-800 light:border-gray-200 px-6 py-4">
          <a
            href="/"
            className="text-xl font-bold tracking-tight hover:text-white light:hover:text-black"
          >
            Yongent
          </a>
          <ThemeToggle />
        </header>
        <main className="px-6 py-8 max-w-4xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
