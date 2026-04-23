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
  icons: {
    // Par light+dark: browser escolhe via prefers-color-scheme.
    //  - light (sem media): ícone PRETO (default) → legível em tabs claras
    //  - dark (media query): ícone BRANCO → legível em tabs escuras
    // Chrome/Safari/Firefox respeitam este pattern; quem não respeitar cai no default (light).
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon-dark.ico", sizes: "any", media: "(prefers-color-scheme: dark)" },
      { url: "/favicon-32-dark.png", type: "image/png", sizes: "32x32", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-512-dark.png", type: "image/png", sizes: "512x512", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/apple-touch-icon-dark.png", sizes: "180x180", media: "(prefers-color-scheme: dark)" },
    ],
    shortcut: ["/favicon.ico"],
  },
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
