/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['logistis.i-mentor.gr', 'localhost:3000'],
    },
  },
}
module.exports = nextConfig
