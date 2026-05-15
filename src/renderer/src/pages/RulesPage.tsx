/**
 * RulesPage.tsx — 加分規則設定頁
 *
 * 老師可調整以下規則：
 *  1. 角色基礎分（組長/助教/組員 A-D）
 *  2. 連對加成
 *  3. 答錯扣分（第一次免扣 + 每次扣分）
 *  4. 抽籤機率倍率
 *  5. 快速加分按鈕陣列
 *  6. 作業未繳扣分
 *  7. 全組完成獎勵
 *  8. 平常考規則（依角色）
 *  9. 段考規則（共用）
 *
 * 每次變更立即寫入 Dexie，下次抽籤即套用。
 */

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getConfig, updateConfig, resetRules } from '../db/configRepo'
import type { ScoringRules, StudentRole, ExamScoringRule } from '../db/schema'
import { ROLE_LABELS } from '../db/schema'

import Button         from '../components/shared/Button'
import RuleSection    from '../components/rules/RuleSection'
import NumberField    from '../components/rules/NumberField'
import SecuritySection from '../components/rules/SecuritySection'
import BackupSection   from '../components/rules/BackupSection'

const ROLES: StudentRole[] = ['leader', 'assistant', 'memberA', 'memberB', 'memberC', 'memberD']

// ── 主元件 ───────────────────────────────────────────────────

const RulesPage: React.FC = () => {
  const config = useLiveQuery(() => getConfig(), [])

  if (!config) {
    return (
      <div className="p-8 text-sm text-gray-500">載入中…</div>
    )
  }

  const rules = config.rules

  // 部分更新規則並寫入 DB
  const update = (patch: Partial<ScoringRules>) => {
    const newRules: ScoringRules = { ...rules, ...patch }
    updateConfig({ rules: newRules })
  }

  // 更新角色基礎分
  const setRoleBase = (role: StudentRole, score: number) => {
    update({ roleBaseScore: { ...rules.roleBaseScore, [role]: score } })
  }

  // 更新平常考規則（依角色）
  const setQuizRule = (role: StudentRole, patch: Partial<ExamScoringRule>) => {
    update({
      quizRules: {
        ...rules.quizRules,
        [role]: { ...rules.quizRules[role], ...patch }
      }
    })
  }

  // 更新段考規則（共用）
  const setExamRule = (patch: Partial<ExamScoringRule>) => {
    update({ examRule: { ...rules.examRule, ...patch } })
  }

  const handleReset = async () => {
    const ok = window.confirm('確定要還原所有規則為預設值嗎？\n（語料庫不受影響）')
    if (!ok) return
    await resetRules()
  }

  return (
    <div className="p-8 max-w-4xl">

      {/* ── 標題 ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">⚖️ 加分規則設定</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            這裡調整的規則會立即套用到抽籤器、考試成績與所有計分流程
          </p>
        </div>
        <Button variant="secondary" onClick={handleReset}>
          還原預設值
        </Button>
      </div>

      {/* ── 0a. 資料備份／還原（最重要，放最上面） ── */}
      <BackupSection />

      {/* ── 0b. 安全與鎖屏（密碼、自動鎖屏） ── */}
      <SecuritySection />

      {/* ── 1. 角色基礎分 ── */}
      <RuleSection
        icon="🎯"
        title="角色基礎分（答對時）"
        description="抽籤答對時依角色給分。建議組員 ≥ 助教 ≥ 組長，鼓勵組員主動發言。"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <div key={r} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-700">{ROLE_LABELS[r]}</span>
              <NumberField
                value={rules.roleBaseScore[r]}
                onChange={(v) => setRoleBase(r, v)}
                suffix="分"
                min={0} max={100}
              />
            </div>
          ))}
        </div>
      </RuleSection>

      {/* ── 2. 連對加成 ── */}
      <RuleSection
        icon="🔥"
        title="連對加成"
        description="每多連對一次，額外加 N 分。例：組員(基礎20) 連對第3次 = 20 + 2×加成"
      >
        <NumberField
          label="每多連對一次加"
          value={rules.correctStreakBonus}
          onChange={(v) => update({ correctStreakBonus: v })}
          suffix="分"
          min={0} max={50}
        />
      </RuleSection>

      {/* ── 3. 答錯扣分 ── */}
      <RuleSection
        icon="❌"
        title="答錯扣分（該節課內）"
        description="該節第 N 次答錯 → 扣 (N-1) × 每次扣分。第 1 次免扣可關閉。"
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rules.wrongPenalty.firstFree}
              onChange={(e) => update({
                wrongPenalty: { ...rules.wrongPenalty, firstFree: e.target.checked }
              })}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">當天第 1 次答錯不扣分</span>
          </label>
          <NumberField
            label="每次答錯扣"
            value={rules.wrongPenalty.perWrong}
            onChange={(v) => update({
              wrongPenalty: { ...rules.wrongPenalty, perWrong: v }
            })}
            suffix="分"
            min={0} max={100}
          />
        </div>
      </RuleSection>

      {/* ── 4. 抽籤機率倍率 ── */}
      <RuleSection
        icon="🎰"
        title="抽籤機率倍率（答錯後提升）"
        description="本次程式啟動以來累計答錯次數越多，被抽中機率越高。重啟程式歸零。"
      >
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">答錯 1 次</p>
            <NumberField
              value={rules.drawWeights.wrong1Multiplier}
              onChange={(v) => update({
                drawWeights: { ...rules.drawWeights, wrong1Multiplier: v }
              })}
              suffix="倍"
              min={1} max={10} step={0.1}
              width="w-16"
            />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">答錯 2 次</p>
            <NumberField
              value={rules.drawWeights.wrong2Multiplier}
              onChange={(v) => update({
                drawWeights: { ...rules.drawWeights, wrong2Multiplier: v }
              })}
              suffix="倍"
              min={1} max={10} step={0.1}
              width="w-16"
            />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">封頂上限</p>
            <NumberField
              value={rules.drawWeights.maxMultiplier}
              onChange={(v) => update({
                drawWeights: { ...rules.drawWeights, maxMultiplier: v }
              })}
              suffix="倍"
              min={1} max={10} step={0.1}
              width="w-16"
            />
          </div>
        </div>
      </RuleSection>

      {/* ── 5. 快速加分按鈕 ── */}
      <RuleSection
        icon="⚡"
        title="快速加分按鈕"
        description="抽籤結果視窗與全班作答模式中顯示的快速加分選項。以逗號分隔輸入。"
      >
        <input
          type="text"
          value={rules.quickScores.join(', ')}
          onChange={(e) => {
            const arr = e.target.value
              .split(',')
              .map(s => Number(s.trim()))
              .filter(n => Number.isFinite(n) && n > 0)
            if (arr.length > 0) update({ quickScores: arr })
          }}
          className="
            w-full h-10 px-3 text-sm font-mono
            bg-white border border-gray-200 rounded-lg
            focus:outline-none focus:border-brand-500
          "
          placeholder="5, 10, 15, 20, 25, 30"
        />
      </RuleSection>

      {/* ── 6. 作業未繳 + 7. 全組完成 ── */}
      <RuleSection
        icon="📚"
        title="作業與小組獎勵"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-2">作業每項未繳扣</p>
            <NumberField
              value={rules.homeworkPenalty}
              onChange={(v) => update({ homeworkPenalty: v })}
              suffix="分（負數表扣分）"
              min={-500} max={0}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-2">全組完成獎勵</p>
            <NumberField
              value={rules.groupAllDoneBonus}
              onChange={(v) => update({ groupAllDoneBonus: v })}
              suffix="分"
              min={0} max={500}
            />
          </div>
        </div>
      </RuleSection>

      {/* ── 8. 平常考規則（每角色標準分） ── */}
      <RuleSection
        icon="📝"
        title="平常考加分規則（依角色）"
        description="每角色設定不同標準分。考試分數 ≥ 標準 → 加分；< 標準 → 扣分。達 90/95/100 額外獎勵。"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left font-medium">角色</th>
                <th className="px-2 py-2 font-medium">標準分</th>
                <th className="px-2 py-2 font-medium">每高1分</th>
                <th className="px-2 py-2 font-medium">每低1分</th>
                <th className="px-2 py-2 font-medium">≥90 加</th>
                <th className="px-2 py-2 font-medium">≥95 加</th>
                <th className="px-2 py-2 font-medium">100 加</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ROLES.map(r => {
                const rule = rules.quizRules[r]
                return (
                  <tr key={r}>
                    <td className="px-2 py-2 font-medium text-gray-700">{ROLE_LABELS[r]}</td>
                    <td className="px-2 py-1.5"><NumberField value={rule.standard} onChange={v => setQuizRule(r, { standard: v })} width="w-14" min={0} max={100} /></td>
                    <td className="px-2 py-1.5"><NumberField value={rule.perAbove} onChange={v => setQuizRule(r, { perAbove: v })} width="w-14" min={0} max={20} /></td>
                    <td className="px-2 py-1.5"><NumberField value={rule.perBelow} onChange={v => setQuizRule(r, { perBelow: v })} width="w-14" min={0} max={20} /></td>
                    <td className="px-2 py-1.5"><NumberField value={rule.bonus90}  onChange={v => setQuizRule(r, { bonus90: v })}  width="w-14" min={0} max={200} /></td>
                    <td className="px-2 py-1.5"><NumberField value={rule.bonus95}  onChange={v => setQuizRule(r, { bonus95: v })}  width="w-14" min={0} max={200} /></td>
                    <td className="px-2 py-1.5"><NumberField value={rule.bonus100} onChange={v => setQuizRule(r, { bonus100: v })} width="w-14" min={0} max={500} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </RuleSection>

      {/* ── 9. 段考規則 ── */}
      <RuleSection
        icon="🎓"
        title="段考加分規則"
        description="段考使用學生「個人標準分」（在學生資料中設定），全角色共用此公式。"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">每高 1 分</p>
            <NumberField value={rules.examRule.perAbove} onChange={v => setExamRule({ perAbove: v })} suffix="分" min={0} max={20} />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">每低 1 分</p>
            <NumberField value={rules.examRule.perBelow} onChange={v => setExamRule({ perBelow: v })} suffix="分" min={0} max={20} />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">≥ 90 額外加</p>
            <NumberField value={rules.examRule.bonus90} onChange={v => setExamRule({ bonus90: v })} suffix="分" min={0} max={200} />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">≥ 95 額外加</p>
            <NumberField value={rules.examRule.bonus95} onChange={v => setExamRule({ bonus95: v })} suffix="分" min={0} max={200} />
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500 mb-1">100 額外加</p>
            <NumberField value={rules.examRule.bonus100} onChange={v => setExamRule({ bonus100: v })} suffix="分" min={0} max={500} />
          </div>
        </div>
      </RuleSection>

      {/* 底部留白 */}
      <div className="h-6" />
    </div>
  )
}

export default RulesPage
