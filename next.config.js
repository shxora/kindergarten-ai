/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development output separate from production builds so running
  // `next build` cannot invalidate the active dev server cache.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  productionBrowserSourceMaps: false, // enable browser source map generation during the production build
  // Configure pageExtensions to include md and mdx
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  experimental: {
    // appDir: true,
  },
  // fix all before production. Now it slow the develop speed.
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // https://nextjs.org/docs/api-reference/next.config.js/ignoring-typescript-errors
    ignoreBuildErrors: true,
  },
  output: 'standalone',
}

module.exports = nextConfig
