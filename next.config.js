/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // 禁用静态导出，因为我们需要API路由
  output: 'standalone',
  
  // 环境变量配置
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  
  // 图片优化配置
  images: {
    domains: [],
    formats: ['image/webp', 'image/avif'],
  },
};

module.exports = nextConfig;