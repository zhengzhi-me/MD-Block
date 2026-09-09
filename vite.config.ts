import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// UI 构建：React + Tailwind 全部内联到单个 index.html，
// 避免 Figma UI iframe 加载相对资源时可能出现的路径问题。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist',
  },
})
