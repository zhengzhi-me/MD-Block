import { Copy, Download, Frame, Link2, LogIn, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useEditorStore } from '../../stores/editorStore'

interface HeaderProps {
  canEdit: boolean
  saved?: boolean
  tocCollapsed: boolean
  onToggleToc?: () => void
  onCopy?: () => void
  onDownload?: () => void
  onImport?: (file: File) => void
  onInsertFrame?: () => void
  onConfigureFileLink?: () => void
}

const iconButtonClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-400'

function HeaderIconButton({
  label,
  onClick,
  onContextMenu,
  popup,
  children,
}: {
  label: string
  onClick: () => void
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  popup?: ReactNode
  children: ReactNode
}) {
  return (
    <span className={`header-icon-button-wrap${popup ? ' header-icon-button-wrap-menu-open' : ''}`}>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        aria-label={label}
        aria-haspopup={onContextMenu ? 'menu' : undefined}
        aria-expanded={onContextMenu ? Boolean(popup) : undefined}
        className={iconButtonClass}
      >
        {children}
      </button>
      <span role="tooltip" className="header-icon-tooltip">{label}</span>
      {popup}
    </span>
  )
}

export function Header({
  canEdit,
  saved,
  tocCollapsed,
  onToggleToc,
  onCopy,
  onDownload,
  onImport,
  onInsertFrame,
  onConfigureFileLink,
}: HeaderProps) {
  const title = useEditorStore((s) => s.title)
  const setTitle = useEditorStore((s) => s.setTitle)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [frameMenuOpen, setFrameMenuOpen] = useState(false)

  useEffect(() => {
    if (!frameMenuOpen) return
    const closeMenu = () => setFrameMenuOpen(false)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [frameMenuOpen])

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onImport?.(file)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
      {onToggleToc && (
        <HeaderIconButton
          onClick={onToggleToc}
          label={tocCollapsed ? '展开目录' : '折叠目录'}
        >
          {tocCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          )}
        </HeaderIconButton>
      )}

      {canEdit ? (
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="文档标题"
          aria-label="文档标题"
          className="min-w-0 flex-1 bg-transparent px-1 text-base font-bold text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
        />
      ) : (
        <h1 className="min-w-0 flex-1 truncate px-1 text-base font-bold text-neutral-900">
          {title || '未命名'}
        </h1>
      )}

      {canEdit && (
        <span className="shrink-0 text-[11px] text-neutral-400">
          {saved ? '已保存' : '保存中…'}
        </span>
      )}

      <div className="header-icon-actions flex shrink-0 items-center gap-0.5">
        {canEdit && onImport && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              className="hidden"
              onChange={handleImport}
            />
            <HeaderIconButton
              onClick={() => fileInputRef.current?.click()}
              label="导入 Markdown"
            >
              <LogIn className="h-4 w-4" aria-hidden />
            </HeaderIconButton>
          </>
        )}
        {canEdit && onInsertFrame && (
          <HeaderIconButton
            onClick={() => {
              setFrameMenuOpen(false)
              onInsertFrame()
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setFrameMenuOpen((open) => !open)
            }}
            label="插入所选画板或图层链接（右键更多）"
            popup={frameMenuOpen && onConfigureFileLink ? (
              <div
                role="menu"
                className="header-context-menu"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setFrameMenuOpen(false)
                    onConfigureFileLink()
                  }}
                >
                  <Link2 className="h-4 w-4" aria-hidden />
                  <span>绑定 Figma 链接</span>
                </button>
              </div>
            ) : undefined}
          >
            <Frame className="h-4 w-4" aria-hidden />
          </HeaderIconButton>
        )}
        {onCopy && (
          <HeaderIconButton
            onClick={onCopy}
            label="复制 Markdown"
          >
            <Copy className="h-4 w-4" aria-hidden />
          </HeaderIconButton>
        )}
        {onDownload && (
          <HeaderIconButton
            onClick={onDownload}
            label="下载 Markdown"
          >
            <Download className="h-4 w-4" aria-hidden />
          </HeaderIconButton>
        )}
      </div>
    </header>
  )
}
