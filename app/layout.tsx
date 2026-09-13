import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/app-version";

export const metadata: Metadata = {
  title: APP_NAME + " | 웹소설 창작 스튜디오",
  description:
    "장편 웹소설의 세계관, 캐릭터, 전체 회차, 복선과 원고를 한곳에서 설계하고 관리하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
