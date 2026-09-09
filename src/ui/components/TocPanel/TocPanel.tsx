import { useMemo, useState } from 'react'
import { useTocStore } from '../../stores/tocStore'
import { buildTree } from '../../parser/toc'
import { TocItem } from './TocItem'

interface TocPanelProps {
  /** 点击目录项时定位到对应标题 */
  onNavigate: (pos: number) => void
  /** 是否折叠目录 */
  collapsed?: boolean
}

export function TocPanel({ onNavigate, collapsed }: TocPanelProps) {
  const headings = useTocStore((s) => s.headings)
  const activeId = useTocStore((s) => s.activeId)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(headings), [headings])

  const toggle = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (collapsed) return null

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-neutral-50/60">
      <div className="sticky top-0 bg-neutral-50/60 px-4 py-3 text-xs font-medium text-neutral-400">
        <span>目录</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-4">
        {tree.length === 0 ? (
          <p className="px-2 py-1 text-xs text-neutral-400">暂无标题</p>
        ) : (
          tree.map((node) => (
            <TocItem
              key={node.id}
              node={node}
              depth={0}
              collapsedIds={collapsedIds}
              activeId={activeId}
              onToggle={toggle}
              onNavigate={onNavigate}
            />
          ))
        )}
      </nav>
    </aside>
  )
}
