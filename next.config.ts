import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 将 ssh2 及其依赖标记为外部模块
  serverExternalPackages: ['ssh2', 'cpu-features'],

  // 使用 standalone 输出模式，更适合 Electron 打包
  output: 'standalone',

  // 禁用 Turbopack 用于生产构建
  experimental: {
    // 确保外部模块不被打包
  },
};

export default nextConfig;
