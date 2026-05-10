/**
 * main.tsx — React 渲染層進入點
 *
 * 掛載根元件 <App /> 至 HTML 中的 #root 節點。
 * React 18 使用 createRoot API（非 ReactDOM.render）。
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'   // 載入 Tailwind CSS

const rootEl = document.getElementById('root')

if (!rootEl) {
  throw new Error('[main.tsx] 找不到 #root 元素，請確認 index.html 結構正確')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
