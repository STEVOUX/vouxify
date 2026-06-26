/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large responses for streaming
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Disable strict mode for streaming compatibility
  reactStrictMode: false,
  // External packages that should not be bundled (server-side only)
  serverExternalPackages: ['ioredis', 'bullmq'],
  // Allow images from Cloudinary and common CDNs
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
