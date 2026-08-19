import "@/styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RPSME Performance Command Center",
  description: "Google Ads Campaign Analytics — AI-Powered Performance Marketing Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
