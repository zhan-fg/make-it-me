import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "写真模板工作台",
  robots: { index: false, follow: false },
};

export default function TemplateAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
