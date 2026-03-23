import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { AppShell } from "@/components/app-shell";
import { PageTransition } from "@/components/page-transition";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Socrato",
  description: "AI-powered study materials generator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AuthProvider>
          <AppShell>
            <PageTransition>{children}</PageTransition>
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
