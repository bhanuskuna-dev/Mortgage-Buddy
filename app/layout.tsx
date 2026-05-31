import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "MortgageReady — Mortgage Qualification Tool",
  description: "Educational mortgage qualification assessment powered by AI. Not legal or lending advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[var(--navy-950)] text-slate-100">
        <NavBar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
