import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Make it me · 一键仿拍",
  description: "保留喜欢的场景与镜头，把主角换成你。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
