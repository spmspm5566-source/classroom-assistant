import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * electron-vite 建置設定
 * 分三個 entry：main（主程序）、preload（預載腳本）、renderer（React 渲染層）
 */
export default defineConfig({
  // ── 主程序：Node.js 環境，外部化所有 node_modules ──
  main: {
    plugins: [externalizeDepsPlugin()]
  },

  // ── 預載腳本：同樣外部化，用於安全橋接 IPC ──
  preload: {
    plugins: [externalizeDepsPlugin()]
  },

  // ── 渲染層：純前端 Vite + React ──
  renderer: {
    resolve: {
      alias: {
        // 路徑別名，讓 import 更簡潔
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
