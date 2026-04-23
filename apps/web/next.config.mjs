/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O proxy para /api/* agora é feito pelo route handler em
  // app/api/[...path]/route.ts, que injeta X-API-Key server-side.
  // Rewrites não suportam injeção de headers, por isso migramos pro handler.
};

export default nextConfig;
