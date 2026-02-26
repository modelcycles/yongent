import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yongent",
  description: "에이전트 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <header className="border-b border-gray-800 px-6 py-4">
          <a href="/" className="text-xl font-bold tracking-tight hover:text-white">
            Yongent
          </a>
        </header>
        <main className="px-6 py-8 max-w-4xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
