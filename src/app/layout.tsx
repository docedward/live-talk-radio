import type { Metadata } from "next";
import { Bebas_Neue, Share_Tech_Mono, Source_Sans_3 } from "next/font/google";
import { RadioShell } from "@/components/RadioShell";
import "./globals.css";

/** Bold station call-letter display — classic AM masthead. */
const fontDisplay = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/** LCD / frequency / ON AIR readout. */
const fontLcd = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-lcd",
  display: "swap",
});

/** Readable body for chat & forms (not a novelty font). */
const fontBody = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Live Talk Radio · W-LTR AM",
  description:
    "Live talk radio with voice panel, chat, and host soundboard — 1980s AM vibe.",
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontDisplay.variable} ${fontLcd.variable} ${fontBody.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-[#0d0906] text-[#1c1410]"
      >
        <RadioShell>{children}</RadioShell>
      </body>
    </html>
  );
}
