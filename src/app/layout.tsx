import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "labs",
  description:
    "Launch tokens on pump.fun and StonkFun from Claude, ChatGPT or Grok. Your wallet signs everything.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
