/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['img.youtube.com', 'i.ytimg.com']
  },
  // simple-peer and react-youtube use browser globals — prevent SSR issues
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'simple-peer']
    }
    return config
  }
}

module.exports = nextConfig
