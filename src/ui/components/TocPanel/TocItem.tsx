import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TocNode } from '../../types/toc'

interface TocItemProps {
  node: TocNode
  depth: number
  collapsedIds: ReadonlySet<string>
  activeId: string | null
  onToggle: (id: string) => void
  onNavigate: (pos: number) => void
}

export function TocItem({
  node,
  depth,
  collapsedIds,
  activeId,
  onToggle,
  onNavigate,
}: TocItemProps) {
  const hasChildren = node.children.length > 0
  const collapsed = collapsedIds.has(node.id)
  const active = node.id === activeId

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-sm leading-5 transition-colors ${
          active
            ? 'bg-neutral-200/70 font-medium text-neutral-900'
            : 'text-neutral-600 hover:bg-neutral-100'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onNavigate(node.pos)}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.id)
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-600"
            aria-label={collapsed ? '展开' : '折叠'}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{node.text}</span>
      </div>

      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <TocItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              activeId={activeId}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
