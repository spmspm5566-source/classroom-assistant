/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/src/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ── 品牌色 ──
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a'
        },
        // ── 角色色（用於座位表卡片邊框、徽章） ──
        role: {
          leader:    '#dc2626',  // 紅 — 組長
          assistant: '#f59e0b',  // 橙 — 助教
          memberA:   '#10b981',  // 綠 — 員A
          memberB:   '#06b6d4',  // 青 — 員B
          memberC:   '#8b5cf6',  // 紫 — 員C
          memberD:   '#ec4899'   // 粉 — 員D
        }
      },
      // ── 自訂陰影 ──
      boxShadow: {
        'widget': '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18)',
        'card':   '0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)'
      },
      // ── 動畫 ──
      keyframes: {
        bounceIn: {
          '0%':   { transform: 'scale(0.5)', opacity: '0' },
          '60%':  { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        flash: {
          '0%, 100%': { backgroundColor: 'rgba(239,68,68,0)' },
          '50%':      { backgroundColor: 'rgba(239,68,68,0.4)' }
        }
      },
      animation: {
        'bounce-in': 'bounceIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'flash':     'flash 0.6s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
