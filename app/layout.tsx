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
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">
        {children}
      </body>
    </html>
  );
}
