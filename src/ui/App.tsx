import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { Header } from './components/Header'
import { TocPanel } from './components/TocPanel'
import { MarkdownEditor, type MarkdownEditorHandle } from './components/MarkdownEditor'
import { useEditorStore } from './stores/editorStore'
import { notify, saveDocument } from './services/blockService'
import { onPluginMessage, sendToPlugin } from './services/pluginBridge'
import { copyToClipboard } from './utils/clipboard'
import {
  downloadMarkdownPackage,
  embedAssetsInMarkdown,
  normalizeMarkdownForExport,
} from './utils/download'
import { fileToImageAsset, imageAssetUri, normalizeImageAsset } from './utils/imageAsset'
import type {
  ResizeDirection,
  WidgetDocData,
  WidgetImageAsset,
} from '../shared/messages'

interface ResizeSession {
  direction: ResizeDirection
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

const resizeHandleClasses: Record<ResizeDirection, string> = {
  n: 'left-2 right-2 top-0 h-1.5 cursor-ns-resize',
  ne: 'right-0 top-0 h-2.5 w-2.5 cursor-nesw-resize',
  e: 'bottom-2 right-0 top-2 w-1.5 cursor-ew-resize',
  se: 'bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize',
  s: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize',
  sw: 'bottom-0 left-0 h-2.5 w-2.5 cursor-nesw-resize',
  w: 'bottom-2 left-0 top-2 w-1.5 cursor-ew-resize',
  nw: 'left-0 top-0 h-2.5 w-2.5 cursor-nwse-resize',
}

export default function App() {
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const assetsRef = useRef<WidgetImageAsset[]>([])
  const figmaFileKeyRef = useRef('')
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const setMarkdown = useEditorStore((s) => s.setMarkdown)
  const setTitle = useEditorStore((s) => s.setTitle)
  const markdown = useEditorStore((s) => s.markdown)
  const title = useEditorStore((s) => s.title)
  const [assets, setAssets] = useState<WidgetImageAsset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(true)
  const [docData, setDocData] = useState<WidgetDocData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(true)
  const [tocCollapsed, setTocCollapsed] = useState(true)
  const [fileLinkDialogOpen, setFileLinkDialogOpen] = useState(false)
  const [fileLinkValue, setFileLinkValue] = useState('')
  const [insertAfterFileLink, setInsertAfterFileLink] = useState(false)
  const [savingFileLink, setSavingFileLink] = useState(false)
  const initializedRef = useRef(false)
  figmaFileKeyRef.current = docData?.figmaFileKey ?? ''

  useEffect(() => {
    const unsubscribe = onPluginMessage((message) => {
      switch (message.type) {
        case 'init': {
          const initialAssets = message.data.assets ?? []
          const initialData = {
            ...message.data,
            assets: initialAssets,
          }
          setDocData(initialData)
          setTitle(initialData.title)
          setMarkdown(initialData.markdown)
          assetsRef.current = initialAssets
          setAssets(initialAssets)
          setCanEdit(message.canEdit)
          setSaved(true)
          setLoading(false)
          initializedRef.current = true
          // 旧版可能保存了 WebP/SVG 或超过 Figma 4096px 边界的图片；后台规范化后沿用原资源 ID。
          void Promise.all(initialAssets.map(async (asset) => {
            try {
              return await normalizeImageAsset(asset)
            } catch {
              return asset
            }
          })).then((normalizedAssets) => {
            const changed = normalizedAssets.some((asset, index) => asset !== initialAssets[index])
            if (!changed) return
            assetsRef.current = normalizedAssets
            setAssets(normalizedAssets)
            setDocData((current) => current ? { ...current, assets: normalizedAssets } : current)
          })
          break
        }
        case 'saved':
          setError(null)
          setSaved(true)
          break
        case 'frame-link-ready':
          setError(null)
          editorRef.current?.insertFrameLink(message.name, message.nodeId, message.url)
          break
        case 'file-link-required':
          setError(null)
          setInsertAfterFileLink(true)
          setFileLinkDialogOpen(true)
          break
        case 'file-link-configured':
          setDocData((current) => current ? { ...current, figmaFileKey: message.fileKey } : current)
          setSavingFileLink(false)
          setFileLinkDialogOpen(false)
          setFileLinkValue('')
          setInsertAfterFileLink(false)
          setError(null)
          break
        case 'error':
          setSavingFileLink(false)
          setError(message.message)
          break
        default:
          break
      }
    })

    sendToPlugin({ type: 'ready' })
    return unsubscribe
  }, [setTitle, setMarkdown])

  useEffect(() => {
    const heartbeat = window.setInterval(() => sendToPlugin({ type: 'ui-heartbeat' }), 2500)
    const handleClosing = () => {
      if (initializedRef.current) {
        const current = useEditorStore.getState()
        saveDocument({
          title: current.title.trim() || '未命名',
          markdown: editorRef.current?.getMarkdown() ?? current.markdown,
          assets: assetsRef.current,
          figmaFileKey: figmaFileKeyRef.current,
        })
      }
      sendToPlugin({ type: 'ui-closing' })
    }

    sendToPlugin({ type: 'ui-heartbeat' })
    window.addEventListener('pagehide', handleClosing)
    window.addEventListener('beforeunload', handleClosing)
    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener('pagehide', handleClosing)
      window.removeEventListener('beforeunload', handleClosing)
      handleClosing()
    }
  }, [])

  // 自动保存：有编辑权限时内容变化，防抖后写入 syncedState。
  useEffect(() => {
    if (loading || !canEdit || !initializedRef.current) return
    setSaved(false)
    const timer = setTimeout(() => {
      saveDocument({
        title: title.trim() || '未命名',
        markdown,
        assets,
        figmaFileKey: docData?.figmaFileKey,
      })
    }, 800)
    return () => clearTimeout(timer)
  }, [markdown, title, assets, loading, canEdit, docData?.figmaFileKey])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = resizeSessionRef.current
      if (!session) return
      const deltaX = event.clientX - session.startX
      const deltaY = event.clientY - session.startY
      const west = session.direction.includes('w')
      const east = session.direction.includes('e')
      const north = session.direction.includes('n')
      const south = session.direction.includes('s')
      const width = Math.max(
        360,
        Math.floor(session.startWidth + (east ? deltaX : west ? -deltaX : 0)),
      )
      const height = Math.max(
        280,
        Math.floor(session.startHeight + (south ? deltaY : north ? -deltaY : 0)),
      )
      const offsetX = west ? session.startWidth - width : 0
      const offsetY = north ? session.startHeight - height : 0
      sendToPlugin({ type: 'resize', width, height, offsetX, offsetY })
      if (width < 560) setTocCollapsed(true)
    }

    const handlePointerUp = () => {
      if (!resizeSessionRef.current) return
      resizeSessionRef.current = null
      sendToPlugin({ type: 'resize-end' })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  const handleResizePointerDown = (
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    resizeSessionRef.current = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: window.innerWidth,
      startHeight: window.innerHeight,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    sendToPlugin({ type: 'resize-start', direction })
    event.preventDefault()
  }

  const handleNavigate = (pos: number) => editorRef.current?.scrollToHeading(pos)

  const handleCopyMarkdown = async () => {
    const raw = normalizeMarkdownForExport(editorRef.current?.getMarkdown() ?? '')
    const portableMarkdown = embedAssetsInMarkdown(raw, assetsRef.current)
    const ok = await copyToClipboard(portableMarkdown)
    notify(ok ? '已复制 Markdown' : '复制失败')
  }

  const handleDownloadMarkdown = () => {
    const raw = normalizeMarkdownForExport(editorRef.current?.getMarkdown() ?? '')
    const currentTitle = useEditorStore.getState().title
    const format = downloadMarkdownPackage(currentTitle, raw, assetsRef.current)
    notify(format === 'zip' ? '已下载 Markdown 与图片附件 ZIP' : '已下载 Markdown')
  }

  const handleImportMarkdown = async (file: File) => {
    try {
      if (file.size > 5 * 1024 * 1024) {
        setError('Markdown 文件不能超过 5 MB。')
        return
      }
      const content = (await file.text()).replace(/^\uFEFF/, '')
      if (!content.trim()) {
        setError('导入的 Markdown 文件没有内容。')
        return
      }
      editorRef.current?.appendMarkdown(content)
      setError(null)
      notify(`已将「${file.name}」追加到文末`)
    } catch {
      setError('无法读取所选 Markdown 文件。')
    }
  }

  const openFileLinkDialog = () => {
    setInsertAfterFileLink(false)
    setFileLinkValue('')
    setError(null)
    setFileLinkDialogOpen(true)
  }

  const closeFileLinkDialog = () => {
    if (savingFileLink) return
    setFileLinkDialogOpen(false)
    setFileLinkValue('')
    setInsertAfterFileLink(false)
  }

  const handleFileLinkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = fileLinkValue.trim()
    if (!url) {
      setError('请粘贴当前 Figma 文件链接。')
      return
    }
    setSavingFileLink(true)
    setError(null)
    sendToPlugin({ type: 'set-figma-file-url', url, insertSelected: insertAfterFileLink })
  }

  const handleUploadImage = useCallback(async (file: File) => {
    const asset = await fileToImageAsset(file)
    const totalBytes = assetsRef.current.reduce((sum, item) => sum + item.dataUrl.length, 0)
    if (totalBytes + asset.dataUrl.length > 12 * 1024 * 1024) {
      throw new Error('当前文档的图片附件总量不能超过 12 MB')
    }
    const nextAssets = [...assetsRef.current, asset]
    assetsRef.current = nextAssets
    setAssets(nextAssets)
    return imageAssetUri(asset.id)
  }, [])

  const resolveImageUrl = useCallback((url: string) => {
    if (!url.startsWith('figma-asset://')) return url
    const assetId = url.slice('figma-asset://'.length)
    return assetsRef.current.find((asset) => asset.id === assetId)?.dataUrl ?? url
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white text-xs text-neutral-400">
        加载中…
      </div>
    )
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-white text-neutral-900">
      <Header
        canEdit={canEdit}
        saved={saved}
        tocCollapsed={tocCollapsed}
        onToggleToc={() => setTocCollapsed((value) => !value)}
        onCopy={handleCopyMarkdown}
        onDownload={handleDownloadMarkdown}
        onImport={canEdit ? handleImportMarkdown : undefined}
        onInsertFrame={canEdit ? () => sendToPlugin({ type: 'insert-selected-frame' }) : undefined}
        onConfigureFileLink={canEdit ? openFileLinkDialog : undefined}
      />
      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span className="min-w-0 flex-1">操作失败：{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-100 hover:text-red-700"
            title="关闭错误提示"
            aria-label="关闭错误提示"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <TocPanel onNavigate={handleNavigate} collapsed={tocCollapsed} />
        <main className="min-h-0 flex-1 overflow-hidden">
          <MarkdownEditor
            ref={editorRef}
            defaultValue={docData?.markdown ?? ''}
            readonly={!canEdit}
            onChange={setMarkdown}
            onUploadImage={handleUploadImage}
            resolveImageUrl={resolveImageUrl}
            onNavigateNode={(nodeId) => sendToPlugin({ type: 'navigate-node', nodeId })}
          />
        </main>
      </div>

      {fileLinkDialogOpen && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/20 p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFileLinkDialog()
          }}
        >
          <form
            onSubmit={handleFileLinkSubmit}
            className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-link-dialog-title"
          >
            <h2 id="file-link-dialog-title" className="text-base font-semibold text-neutral-900">
              设置当前 Figma 文件链接
            </h2>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              请在当前 Figma 文件中点击“分享 → 复制链接”。同一文件只需绑定一次，文件内所有 MD Block 和协作者都会复用。
            </p>
            {docData?.figmaFileKey && (
              <p className="mt-2 text-xs text-emerald-600">当前文件已绑定，可粘贴新链接重新绑定。</p>
            )}
            <input
              autoFocus
              type="url"
              value={fileLinkValue}
              onChange={(event) => setFileLinkValue(event.target.value)}
              placeholder="https://www.figma.com/design/…"
              aria-label="当前 Figma 文件链接"
              className="mt-4 h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeFileLinkDialog}
                disabled={savingFileLink}
                className="h-9 rounded-lg px-4 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingFileLink || !fileLinkValue.trim()}
                className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingFileLink ? '保存中…' : insertAfterFileLink ? '保存并插入' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}

      {(Object.keys(resizeHandleClasses) as ResizeDirection[]).map((direction) => (
        <div
          key={direction}
          onPointerDown={(event) => handleResizePointerDown(direction, event)}
          role="presentation"
          aria-label={`从 ${direction} 方向调整窗口大小`}
          className={`absolute z-50 ${resizeHandleClasses[direction]}`}
        />
      ))}
    </div>
  )
}
