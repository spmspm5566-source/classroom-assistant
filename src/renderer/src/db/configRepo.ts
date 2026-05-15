/**
 * configRepo.ts — 系統設定（規則、語料庫、偏好）
 *
 * 整個應用程式只有一筆 config 文件，key='main'。
 * 首次啟動時若不存在，自動以預設值建立。
 *
 * 重要：getConfig() 會把舊資料與最新預設值「深度合併」，
 * 確保新增的欄位（如 quizRules、examRule）不會因舊資料缺欄而導致頁面崩潰。
 */

import { db, type ConfigDoc, type ScoringRules } from './schema'
import { DEFAULT_RULES }       from '../data/default-rules'
import { DEFAULT_PRAISE, DEFAULT_ENCOURAGEMENT } from '../data/default-praise'

const CONFIG_KEY = 'main' as const

// ── 預設文件 ─────────────────────────────────────────────────

function buildDefaultConfig(): ConfigDoc {
  return {
    key:           CONFIG_KEY,
    rules:         DEFAULT_RULES,
    praise:        DEFAULT_PRAISE,
    encouragement: DEFAULT_ENCOURAGEMENT,
    prefs: {
      isMuted:           false,
      showAnimations:    true,
      passwordHash:      null,
      passwordHint:      '',
      encryptedPassword: null,
      autoLockMinutes:   30
    }
  }
}

// ── 深度合併工具 ─────────────────────────────────────────────

/**
 * mergeRules
 * 把舊規則與最新預設值合併：以舊資料為主，缺什麼欄位就用預設值補上。
 * 保證所有新欄位（quizRules、examRule 等）都存在，避免 UI 讀不到屬性而崩潰。
 */
function mergeRules(defaults: ScoringRules, partial: Partial<ScoringRules> | undefined): ScoringRules {
  const p = partial ?? {}
  return {
    roleBaseScore:      { ...defaults.roleBaseScore,    ...(p.roleBaseScore    ?? {}) },
    correctStreakBonus: p.correctStreakBonus  ?? defaults.correctStreakBonus,
    wrongPenalty:       { ...defaults.wrongPenalty,     ...(p.wrongPenalty     ?? {}) },
    drawWeights:        { ...defaults.drawWeights,      ...(p.drawWeights      ?? {}) },
    quickScores:        p.quickScores         ?? defaults.quickScores,
    homeworkPenalty:    p.homeworkPenalty     ?? defaults.homeworkPenalty,
    groupAllDoneBonus:  p.groupAllDoneBonus   ?? defaults.groupAllDoneBonus,
    quizRules: {
      leader:    { ...defaults.quizRules.leader,    ...(p.quizRules?.leader    ?? {}) },
      assistant: { ...defaults.quizRules.assistant, ...(p.quizRules?.assistant ?? {}) },
      memberA:   { ...defaults.quizRules.memberA,   ...(p.quizRules?.memberA   ?? {}) },
      memberB:   { ...defaults.quizRules.memberB,   ...(p.quizRules?.memberB   ?? {}) },
      memberC:   { ...defaults.quizRules.memberC,   ...(p.quizRules?.memberC   ?? {}) },
      memberD:   { ...defaults.quizRules.memberD,   ...(p.quizRules?.memberD   ?? {}) }
    },
    examRule:           { ...defaults.examRule,         ...(p.examRule         ?? {}) }
  }
}

/** 完整合併一個 ConfigDoc */
function mergeConfig(defaults: ConfigDoc, existing: Partial<ConfigDoc>): ConfigDoc {
  return {
    key:           CONFIG_KEY,
    rules:         mergeRules(defaults.rules, existing.rules as Partial<ScoringRules> | undefined),
    praise:        Array.isArray(existing.praise)        && existing.praise.length        > 0 ? existing.praise        : defaults.praise,
    encouragement: Array.isArray(existing.encouragement) && existing.encouragement.length > 0 ? existing.encouragement : defaults.encouragement,
    prefs: {
      isMuted:                existing.prefs?.isMuted                ?? defaults.prefs.isMuted,
      showAnimations:         existing.prefs?.showAnimations         ?? defaults.prefs.showAnimations,
      passwordHash:           existing.prefs?.passwordHash           ?? defaults.prefs.passwordHash,
      passwordHint:           existing.prefs?.passwordHint           ?? defaults.prefs.passwordHint,
      encryptedPassword:      existing.prefs?.encryptedPassword      ?? defaults.prefs.encryptedPassword,
      autoLockMinutes:        existing.prefs?.autoLockMinutes        ?? defaults.prefs.autoLockMinutes,
      lastPromotedSchoolYear: existing.prefs?.lastPromotedSchoolYear ?? defaults.prefs.lastPromotedSchoolYear
    }
  }
}

// ── 讀取 ─────────────────────────────────────────────────────

/**
 * getConfig
 * 取得設定。若不存在自動建立預設值並回傳。
 * 若已存在但缺少新欄位（升級後第一次讀取），會自動補齊並寫回 DB。
 */
export async function getConfig(): Promise<ConfigDoc> {
  const defaults = buildDefaultConfig()

  try {
    const cfg = await db.config.get(CONFIG_KEY)
    if (!cfg) {
      await db.config.put(defaults)
      return defaults
    }

    // 補齊新欄位（不破壞舊值）
    const merged = mergeConfig(defaults, cfg)

    // 如果合併後與原資料有差異，寫回 DB（自我修復）
    if (JSON.stringify(merged) !== JSON.stringify(cfg)) {
      await db.config.put(merged)
    }
    return merged
  } catch (e) {
    console.error('[configRepo] getConfig 失敗，回傳預設值:', e)
    return defaults
  }
}

// ── 更新 ─────────────────────────────────────────────────────

/**
 * updateConfig
 * 部分更新（淺合併）。深層欄位（如 rules）需傳入完整物件以避免遺失。
 */
export async function updateConfig(patch: Partial<ConfigDoc>): Promise<ConfigDoc> {
  const cur = await getConfig()
  const merged: ConfigDoc = { ...cur, ...patch, key: CONFIG_KEY }
  await db.config.put(merged)
  return merged
}

/** 還原成預設規則（保留語料庫與偏好） */
export async function resetRules(): Promise<ConfigDoc> {
  const cur = await getConfig()
  return updateConfig({ ...cur, rules: buildDefaultConfig().rules })
}

/** 還原成預設語料庫（保留規則） */
export async function resetPhrases(): Promise<ConfigDoc> {
  return updateConfig({
    praise:        DEFAULT_PRAISE,
    encouragement: DEFAULT_ENCOURAGEMENT
  })
}

// ── 密碼相關 ─────────────────────────────────────────────────

import { hashPassword, encryptPasswordWithEmail, recoverPasswordWithEmail } from '../utils/auth'

/**
 * setPassword
 * 設定（或修改）密碼。
 *  - 用 SHA-256 hash 存（用於登入驗證）
 *  - 若提供 email，用 AES-GCM 加密原密碼（用於忘記密碼救援）
 *
 * @param password 新密碼明文
 * @param hint     公開的密碼提示（顯示於鎖屏）
 * @param email    救援用信箱（必填以啟用救援功能；省略則救援失效）
 */
export async function setPassword(
  password: string,
  hint:     string = '',
  email:    string = ''
): Promise<void> {
  const passwordHash      = await hashPassword(password)
  const encryptedPassword = email.trim()
    ? await encryptPasswordWithEmail(password, email)
    : null
  const cur = await getConfig()
  await updateConfig({
    prefs: {
      ...cur.prefs,
      passwordHash,
      passwordHint: hint.trim(),
      encryptedPassword
    }
  })
}

/**
 * recoverPasswordByEmail
 * 嘗試用信箱解密恢復密碼。
 * @returns 解出的原密碼；null = 信箱錯誤、未設定救援、或資料毀損
 */
export async function recoverPasswordByEmail(email: string): Promise<string | null> {
  const cfg = await getConfig()
  const enc = cfg.prefs.encryptedPassword
  if (!enc) return null
  if (!email.trim()) return null
  return recoverPasswordWithEmail(enc, email)
}

/**
 * getPasswordInfo
 * 取得目前的密碼狀態（用於 LockScreen 判斷顯示「設定」或「解鎖」）。
 */
export async function getPasswordInfo(): Promise<{
  hasPassword: boolean
  hint:        string
}> {
  const cfg = await getConfig()
  return {
    hasPassword: !!cfg.prefs.passwordHash,
    hint:        cfg.prefs.passwordHint ?? ''
  }
}

/**
 * setAutoLockMinutes
 * 設定閒置多少分鐘自動鎖屏。0 = 永不自動鎖。
 */
export async function setAutoLockMinutes(minutes: number): Promise<void> {
  const cur = await getConfig()
  await updateConfig({
    prefs: { ...cur.prefs, autoLockMinutes: Math.max(0, Math.floor(minutes)) }
  })
}

/**
 * resetEverything
 * 「忘記密碼，重設」流程：把整個 IndexedDB 砍掉重練。
 * 學生資料、加分記錄、密碼全部清空，等於回到全新安裝狀態。
 *
 * 注意：呼叫端通常要 reload 整個 app，否則 React 元件還握著被刪資料的引用。
 */
export async function resetEverything(): Promise<void> {
  const { db } = await import('./schema')
  await db.delete()
}

