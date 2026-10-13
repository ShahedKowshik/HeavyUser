import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeavyUser",
  description: "A new HeavyUser is taking shape.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
