import type { Metadata } from "next";
import localFont from "next/font/local";
import "../node_modules/@react95/core/dist/esm/GlobalStyle/GlobalStyle.css.ts.vanilla.css";
import "../node_modules/@react95/core/dist/esm/themes/vaporTeal.css.ts.vanilla.css";
import "./globals.css";

const w95 = localFont({
  src: "../w95fa/w95f.woff2",
  variable: "--font-w95",
  display: "swap",
});

export const metadata: Metadata = {
  title: "it's prism day",
  description: "Project uploaded portraits onto pyramids and other 3D solids.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${w95.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
