import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "薯薯雪线 — 单板无尽滑雪";
const description =
  "赢取薯薯币、搭配雪板与雪服，带着金丝熊挖挖机和金渐层猫车车在无限雪道上刷新纪录。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title,
    description,
    applicationName: "薯薯雪线",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "薯薯雪线",
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/favicon.svg",
      apple: "/icons/icon-192.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1536,
          height: 1024,
          alt: "薯薯雪线主角、金丝熊挖挖机和金渐层猫车车一起滑雪",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071b2b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
