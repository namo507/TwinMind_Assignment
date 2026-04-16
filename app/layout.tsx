import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TwinMind — Live Suggestions",
  description:
    "Live meeting copilot: rolling transcript, 3 contextual AI suggestions every 30s, and a streaming RAG chat. Powered by Groq whisper-large-v3 + openai/gpt-oss-120b.",
  applicationName: "TwinMind Live Suggestions",
  robots: { index: false, follow: false },
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  themeColor: "#0a0d16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
