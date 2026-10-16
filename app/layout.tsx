import type { Metadata } from "next";
import { Inter, Noto_Naskh_Arabic, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const naskh = Noto_Naskh_Arabic({
  variable: "--font-naskh",
  subsets: ["arabic"],
  display: "swap",
  preload: false,
});

const nastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-nastaliq",
  subsets: ["arabic"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Kiraya Hisab | Accountant",
  description: "Accountant rent management dashboard for plazas, flats and shops in Pakistan.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${naskh.variable} ${nastaliq.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full bg-bg text-text">{children}</body>
    </html>
  );
}
