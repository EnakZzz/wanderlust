import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Wanderlust Planner",
  description: "Plan trips on the web. Carry them offline on your phone.",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
