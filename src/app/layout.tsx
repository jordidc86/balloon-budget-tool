import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DbStatus } from "@/components/ui";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Balloon Budget Tool | Schroeder & Pasha",
  description: "Professional balloon budgeting system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className} suppressHydrationWarning>
        <div className="bg-mesh" />
        <main className="relative min-h-screen">
          {children}
        </main>
        <DbStatus />
      </body>
    </html>
  );
}
