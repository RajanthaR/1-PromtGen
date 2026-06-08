import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { AppNavigation } from "../src/navigation/app-navigation";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  description: "PromptForge Studio editor for enhancing and refining prompts.",
  title: "PromptForge Studio",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
