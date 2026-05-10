/**
 * audio.ts — 音效系統
 *
 * 設計策略：
 *  階段 1（目前）— 用 Web Audio API 程式產生音效，
 *                  避免打包音效檔、立即可用、體積小。
 *  階段 2（之後） — 整合 Howler.js 支援老師上傳 mp3/wav，
 *                  存在 IndexedDB（Blob），由 useAudioStore 管理。
 *
 * 全域靜音：每次播放前讀取 useAppStore.isMuted，若為 true 則直接 return。
 *
 * 音效清單：
 *  - timerWarning  最後 N 秒的「嗶」短促警告
 *  - timerEnd      時間到的「叮」較長提示音
 *  - correct       答對的歡樂上行三和弦（之後用）
 *  - wrong         答錯的低沉短音（之後用）
 *  - drawTick      抽籤輪盤跑動的滴答聲（之後用）
 *  - drawStop      抽籤定格的提示音（之後用）
 */

import { useAppStore } from '../store/useAppStore'

// ── 單一 AudioContext 實例（瀏覽器規範，不可任意 new）─────────

let _ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!_ctx) {
    // 使用者第一次互動後才能建立（瀏覽器自動播放政策）
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  // 若 context 被 suspend（背景頁面），主動恢復
  if (_ctx.state === 'suspended') {
    _ctx.resume()
  }
  return _ctx
}

// ── 內部工具：產生單音 ───────────────────────────────────────

interface ToneOptions {
  /** 頻率（Hz） */
  freq:     number
  /** 持續秒數 */
  duration: number
  /** 起始時間偏移（秒） */
  startAt?: number
  /** 音量 0~1 */
  gain?:    number
  /** 波形類型 */
  type?:    OscillatorType
  /** 結束時是否漸弱（避免爆音） */
  fadeOut?: boolean
}

function playTone(opts: ToneOptions): void {
  const ctx = getCtx()
  const t   = ctx.currentTime + (opts.startAt ?? 0)

  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.frequency.value = opts.freq
  osc.type            = opts.type ?? 'sine'

  // 用 gain envelope 包裝以避免起始/結束的爆音
  const peak     = opts.gain ?? 0.25
  const fadeTime = 0.01
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peak, t + fadeTime)
  if (opts.fadeOut !== false) {
    gain.gain.linearRampToValueAtTime(0, t + opts.duration)
  } else {
    gain.gain.setValueAtTime(peak, t + opts.duration - fadeTime)
    gain.gain.linearRampToValueAtTime(0, t + opts.duration)
  }

  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + opts.duration + 0.05)
}

// ── 公開 API：靜音感知的播放 ──────────────────────────────────

function isMuted(): boolean {
  return useAppStore.getState().isMuted
}

/**
 * playWarning — 倒數警告嗶聲
 * 短促高頻單音，最後 N 秒每秒一次。
 */
export function playTimerWarning(): void {
  if (isMuted()) return
  playTone({ freq: 880, duration: 0.12, gain: 0.3, type: 'square' })
}

/**
 * playTimerEnd — 時間到提示音
 * 三段下行音「叮叮叮」，比警告長且明顯。
 */
export function playTimerEnd(): void {
  if (isMuted()) return
  // 三段下行 + 一段長尾
  playTone({ freq: 1046, duration: 0.18, startAt: 0.00, gain: 0.35, type: 'sine' })
  playTone({ freq:  880, duration: 0.18, startAt: 0.20, gain: 0.35, type: 'sine' })
  playTone({ freq:  698, duration: 0.45, startAt: 0.40, gain: 0.40, type: 'sine' })
}

/**
 * playCorrect — 答對音效（上行歡樂三音）
 * 階段 4 抽籤系統會用到。
 */
export function playCorrect(): void {
  if (isMuted()) return
  playTone({ freq: 523,  duration: 0.10, startAt: 0.00, gain: 0.30 })   // C5
  playTone({ freq: 659,  duration: 0.10, startAt: 0.10, gain: 0.30 })   // E5
  playTone({ freq: 784,  duration: 0.20, startAt: 0.20, gain: 0.35 })   // G5
}

/**
 * playWrong — 答錯音效（下行低沉短音）
 */
export function playWrong(): void {
  if (isMuted()) return
  playTone({ freq: 220, duration: 0.10, startAt: 0.00, gain: 0.30, type: 'square' })
  playTone({ freq: 165, duration: 0.20, startAt: 0.10, gain: 0.30, type: 'square' })
}

/**
 * playDrawTick — 抽籤滾動滴答聲
 */
export function playDrawTick(): void {
  if (isMuted()) return
  playTone({ freq: 600, duration: 0.04, gain: 0.18, type: 'square' })
}

/**
 * playDrawStop — 抽籤定格提示
 */
export function playDrawStop(): void {
  if (isMuted()) return
  playTone({ freq: 1200, duration: 0.10, gain: 0.35, type: 'sine' })
  playTone({ freq:  900, duration: 0.20, startAt: 0.10, gain: 0.35, type: 'sine' })
}

/**
 * primeAudio
 * 解除瀏覽器自動播放限制。
 * 必須由「使用者實際互動」（點擊、按鍵）觸發呼叫。
 * 建議在 App 掛載後第一次 click 事件觸發，或在「進入計時器」按鈕點擊時呼叫。
 */
export function primeAudio(): void {
  try {
    getCtx()
  } catch (err) {
    console.warn('[audio] AudioContext 建立失敗', err)
  }
}
