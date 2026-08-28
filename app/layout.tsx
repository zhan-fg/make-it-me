import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Make it me · 换你来拍",
  description: "从一张照片或一段视频出发，进入同一个场景，拍成你的版本。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}


