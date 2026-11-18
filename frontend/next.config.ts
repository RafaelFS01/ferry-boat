import type { NextConfig } from 'next';

// Atrás do Nginx de borda, /api/edge/* nunca chega ao Next.js.
// O rewrite cobre a execução isolada (npm run dev) apontando direto para o NestJS local.
const edgeApiUrl = process.env.EDGE_API_URL ?? 'http://localhost:3002';

// Bind mounts do Docker no Windows/macOS não propagam eventos de arquivo: o
// container de dev define NEXT_WATCH_POLL_MS para o Turbopack usar polling.
const pollIntervalMs = Number(process.env.NEXT_WATCH_POLL_MS) || undefined;

const nextConfig: NextConfig = {
  output: 'standalone',
  watchOptions: { pollIntervalMs },
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/edge/:path*', destination: `${edgeApiUrl}/:path*` }];
  },
};

export default nextConfig;
