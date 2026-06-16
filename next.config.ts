import type { NextConfig } from 'next';

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'images.thdstatic.com' },
      { protocol: 'https', hostname: '**.walmartimages.com' },
      { protocol: 'https', hostname: 'target.scene7.com' },
      { protocol: 'https', hostname: '**.target.com' },
    ],
  },
};

export default config;
