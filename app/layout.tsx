import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Still · Mental Health Wellness",
  description:
    "A quiet space to reflect, notice patterns, and understand your everyday wellbeing.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
