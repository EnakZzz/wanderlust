import type { Metadata, Viewport } from "next";
import { productBrand } from "@wanderlust/domain";
import { AppProviders } from "@/components/AppProviders";
import "./styles.css";

export const metadata: Metadata = {
  title: productBrand.name,
  description: productBrand.description,
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
