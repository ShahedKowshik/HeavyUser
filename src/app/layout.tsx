import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/components/auth-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const dynamic = "force-dynamic";

const siteTitle = "HeavyUser — Tasks";
const siteDescription = "A focused daily workspace for tasks and time.";
const siteUrl = "https://web.heavyuser.app";
const brandImage = "/heavyuser-mark.png";
const faviconImage = "/heavyuser-favicon.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  icons: {
    icon: [{ url: faviconImage, type: "image/png" }],
    shortcut: [faviconImage],
    apple: [{ url: faviconImage, type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "HeavyUser",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: brandImage, width: 2160, height: 2160, alt: "HeavyUser logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [brandImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("antialiased", "font-sans", inter.variable)}>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
