/**
 * vite.web.config.ts — 純網頁版（PWA）建置設定
 *
 * 雙軌制的 web 軌：把 React renderer 打包成獨立網頁，
 * 不含 Electron 主程序、preload，可部署到任何 HTTPS 伺服器
 * （Cloudflare Pages、GitHub Pages、Netlify 等都免費）。
 *
 * 與 electron.vite.config.ts 共用 src/renderer 原始碼，
 * 由 src/renderer/src/utils/platform.ts 在 runtime 偵測環境並切換 UI。
 *
 * 開發：npm run dev:web   （http://localhost:5174）
 * 打包：npm run build:web （產物在 dist-web/）
 * 預覽：npm run preview:web
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  // 入口指向 renderer
  root: resolve(__dirname, 'src/renderer'),

  // 部署到子目錄時可改（預設 '/'）
  base: './',

  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },

  plugins: [react()],

  // dev server
  server: {
    port: 5174,
    strictPort: false
  },

  // build 產物
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    sourcemap: false,
    // 把 chunk 拆細以加快首次載入
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':   ['react', 'react-dom'],
          'animation':      ['framer-motion'],
          'excel':          ['exceljs']
        }
      }
    }
  },

  preview: {
    port: 4174
  }
})
