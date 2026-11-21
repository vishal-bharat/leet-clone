import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Java Prep",
  description: "Local LeetCode-style practice for Java interviews",
  icons: "/favicon.ico",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
