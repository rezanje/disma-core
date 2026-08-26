import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import GlobalAnnouncement from "@/components/layout/global-announcement";
import StoreSync from "@/components/providers/store-sync";
import HydrationGate from "@/components/providers/hydration-gate";
import { Toaster } from "@/components/ui/sonner";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Disma Core",
  description: "Sistem operasional Disma Fresh",
};

import DevOverlay from "@/components/dev-overlay";
import GlobalUndoButton from "@/components/global-undo-button";
import { OnboardingProvider } from "@/components/onboarding/onboarding";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <GlobalAnnouncement />
        <StoreSync />
        <HydrationGate>
          {children}
        </HydrationGate>
        <Toaster />
        <DevOverlay />
        <GlobalUndoButton />
        <OnboardingProvider />
      </body>
    </html>
  );
}


