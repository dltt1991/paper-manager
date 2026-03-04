import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // 仅在未设置 VITE_API_BASE_URL 时使用代理（本地开发模式）
    // 跨机器访问时，前端直接使用 VITE_API_BASE_URL 连接后端
    proxy: process.env.VITE_API_BASE_URL ? undefined : {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // 去掉 /api 前缀，转发到后端
        // 例如：/api/papers -> http://localhost:8000/papers
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
})
