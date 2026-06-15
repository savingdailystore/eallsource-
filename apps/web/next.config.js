const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  webpack: (config) => {
    // Resolve monorepo packages from root
    const root = path.resolve(__dirname, '../..');
    config.resolve.alias['@lib']    = path.join(root, 'lib');
    config.resolve.alias['@server'] = path.join(root, 'server');
    config.resolve.alias['@scraper']= path.join(root, 'scraper');
    config.resolve.alias['@db']     = path.join(root, 'db');
    return config;
  },
};

module.exports = nextConfig;
