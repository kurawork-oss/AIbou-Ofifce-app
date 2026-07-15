import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIbou Office — AIだけで回る会社",
  description:
    "AI社員が営業・事務・マーケティングを自律的に回すバーチャルカンパニー管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col text-slate-900 galaxy-body">
        {/* 銀河の背景(星のきらめき+流れ星) */}
        <div className="galaxy-bg" aria-hidden>
          <div className="stars-layer stars-sm" />
          <div className="stars-layer stars-md" />
          <div className="nebula" />
          <span className="shooting-star" style={{ top: "12%", left: "68%", animationDelay: "2s" }} />
          <span className="shooting-star" style={{ top: "30%", left: "22%", animationDelay: "9s" }} />
          <span className="shooting-star" style={{ top: "6%", left: "38%", animationDelay: "16s" }} />
        </div>
        {children}
      </body>
    </html>
  );
}
