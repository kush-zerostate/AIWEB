import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preta AI — Component Generator",
  description: "Generate theme-aware UI components with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
