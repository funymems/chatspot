import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import "@/lib/validation/locale";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ChatSpot", template: "%s · ChatSpot" },
  description: "Автоматизация переписки, визуальные сценарии и ИИ-агенты для авторов и малого бизнеса.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster theme="light" richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
