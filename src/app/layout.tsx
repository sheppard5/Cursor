import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-unbounded",
});

export const metadata: Metadata = {
  title: "Xiaomi 14T Pro",
  description: "Безпечна оптимізація Xiaomi 14T Pro по Wi-Fi: 144 Гц, батарея, реклама HyperOS, кеш і сховище.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" className={`dark ${onest.variable} ${unbounded.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
