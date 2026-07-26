import type { Metadata } from "next";
import { productBrand } from "@wanderlust/domain";
import "./styles.css";

export const metadata: Metadata = {
  title: productBrand.name,
  description: productBrand.description,
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
