import "./globals.css";
import { Inter, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Geist Mono — zero redondo limpo, moderna, combina com Inter (mesma família visual)
const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-mono-next",
  display: "swap",
});

export const metadata = {
  title: "NUX Pulse",
  description: "Analytics for Paid Media",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      data-density="comfortable"
      className={`${inter.variable} ${mono.variable}`}
      style={{ colorScheme: "dark" }}
    >
      <body style={{ background: "#0B0B0A" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
