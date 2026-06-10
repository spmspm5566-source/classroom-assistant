/**
 * StudentRow.tsx — 學生清單單列（含分組/角色快速指派）
 *
 * 顯示：座號、姓名、目前分組、角色、總分（之後接）
 * 行為：點擊「分組」可在當列直接切換組別，點擊「角色」切換角色
 */

import React from 'react'
import type { Student, Group, StudentRole } from '../../db/schema'
import { ROLE_LABELS } from '../../db/schema'
import { deleteStudent } from '../../db/studentRepo'
import { assignClassroom } from '../../db/assignmentRepo'

interface StudentRowProps {
  student:      Student
  groups:       Group[]
  examPeriodId: string | null
  onEdit:       (s: Student) => void
}

const ROLE_OPTIONS: { value: StudentRole | '', label: string }[] = [
  { value: '',          label: '未指派' },
  { value: 'leader',    label: ROLE_LABELS.leader },
  { value: 'assistant', label: ROLE_LABELS.assistant },
  { value: 'memberA',   label: ROLE_LABELS.memberA },
  { value: 'memberB',   label: ROLE_LABELS.memberB },
  { value: 'memberC',   label: ROLE_LABELS.memberC },
  { value: 'memberD',   label: ROLE_LABELS.memberD }
]

const StudentRow: React.FC<StudentRowProps> = ({ student, groups, examPeriodId, onEdit }) => {

  // 切換分組（寫入目前段考期的指派）
  const handleGroupChange = async (groupId: string) => {
    if (!examPeriodId) return
    await assignClassroom(examPeriodId, student.classId, student.id, groupId || null, student.role)
  }

  // 切換角色
  const handleRoleChange = async (role: string) => {
    if (!examPeriodId) return
    await assignClassroom(examPeriodId, student.classId, student.id, student.groupId, (role || null) as StudentRole | null)
  }

  // 修改姓名 / 座號（透過外部 onEdit 對話框）

  // 刪除單筆
  const handleDelete = async () => {
    const ok = window.confirm(`確定要刪除「${student.seatNo} ${student.name}」嗎？\n（加分歷史記錄會保留）`)
    if (!ok) return
    await deleteStudent(student.id)
  }

  return (
    <tr className="hover:bg-gray-50">
      {/* 座號 */}
      <td className="px-3 py-2 text-sm font-mono">{student.seatNo}</td>

      {/* 姓名 */}
      <td className="px-3 py-2 text-sm font-medium text-gray-800">{student.name}</td>

      {/* 分組（只列出目前段考期的組；學生的 groupId 若指向其他期會顯示為未分組） */}
      <td className="px-3 py-2">
        <select
          value={groups.find(g => g.id === student.groupId) ? student.groupId! : ''}
          onChange={(e) => handleGroupChange(e.target.value)}
          className="
            text-xs h-7 px-2 rounded-md
            bg-white border border-gray-200
            focus:outline-none focus:border-brand-500
          "
        >
          <option value="">未分組</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name ?? `第${g.number}組`}</option>
          ))}
        </select>
      </td>

      {/* 角色 */}
      <td className="px-3 py-2">
        <select
          value={groups.find(g => g.id === student.groupId) && student.role ? student.role : ''}
          onChange={(e) => handleRoleChange(e.target.value)}
          disabled={!groups.find(g => g.id === student.groupId)}
          className={`
            text-xs h-7 px-2 rounded-md
            bg-white border border-gray-200
            focus:outline-none focus:border-brand-500
            ${!groups.find(g => g.id === student.groupId) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {ROLE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </td>

      {/* 備註 */}
      <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[150px]">
        {student.remarks ?? ''}
      </td>

      {/* 操作 */}
      <td className="px-3 py-2 text-right">
        <button
          onClick={() => onEdit(student)}
          className="text-xs px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100"
          title="編輯"
        >
          ✏
        </button>
        <button
          onClick={handleDelete}
          className="text-xs px-2 py-1 rounded-md text-red-500 hover:bg-red-50 ml-1"
          title="刪除"
        >
          🗑
        </button>
      </td>
    </tr>
  )
}

export default StudentRow
