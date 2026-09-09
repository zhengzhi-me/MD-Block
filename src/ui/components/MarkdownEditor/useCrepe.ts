import { useCallback, useEffect, useRef, useState } from 'react'
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { blockEdit } from '@milkdown/crepe/feature/block-edit'
import { cursor } from '@milkdown/crepe/feature/cursor'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip'
import { listItem } from '@milkdown/crepe/feature/list-item'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { table } from '@milkdown/crepe/feature/table'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { tableBlockView } from '@milkdown/kit/component/table-block'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { addColAfterCommand, addRowAfterCommand } from '@milkdown/kit/preset/gfm'
import { replaceAll } from '@milkdown/utils'
import { extractHeadings } from '../../parser/toc'
import type { FlatHeading } from '../../types/toc'
import { activeHeadingSyntax } from './activeHeadingSyntax'
import '@milkdown/crepe/theme/common/prosemirror.css'
import '@milkdown/crepe/theme/common/reset.css'
import '@milkdown/crepe/theme/common/block-edit.css'
import '@milkdown/crepe/theme/common/cursor.css'
import '@milkdown/crepe/theme/common/image-block.css'
import '@milkdown/crepe/theme/common/link-tooltip.css'
import '@milkdown/crepe/theme/common/list-item.css'
import '@milkdown/crepe/theme/common/placeholder.css'
import '@milkdown/crepe/theme/common/toolbar.css'
import '@milkdown/crepe/theme/common/table.css'
import '@milkdown/crepe/theme/frame.css'

interface UseCrepeOptions {
  /** 编辑器初始 Markdown 内容 */
  defaultValue: string
  /** 是否只读（预览模式） */
  readonly?: boolean
  /** 内容变化时回调，返回最新 Markdown 源码 */
  onChange?: (markdown: string) => void
  /** 标题结构变化时回调 */
  onHeadingsChange?: (headings: FlatHeading[]) => void
  /** 图片上传后返回写入 Markdown 的稳定资源 URI */
  onUploadImage?: (file: File) => Promise<string>
  /** 将稳定资源 URI 转成编辑器可显示的 URL */
  resolveImageUrl?: (url: string) => Promise<string> | string
  /** 点击内部画板链接 */
  onNavigateNode?: (nodeId: string) => void
}

/**
 * 创建并管理 Milkdown Crepe 编辑器实例。
 * 编辑器直接挂载到返回的 DOM 节点上，不经过 iframe。
 */
export function useCrepe({
  defaultValue,
  readonly,
  onChange,
  onHeadingsChange,
  onUploadImage,
  resolveImageUrl,
  onNavigateNode,
}: UseCrepeOptions) {
  const rootRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<CrepeBuilder | null>(null)
  const onChangeRef = useRef(onChange)
  const onHeadingsChangeRef = useRef(onHeadingsChange)
  const onUploadImageRef = useRef(onUploadImage)
  const resolveImageUrlRef = useRef(resolveImageUrl)
  const onNavigateNodeRef = useRef(onNavigateNode)
  const [ready, setReady] = useState(false)

  onChangeRef.current = onChange
  onHeadingsChangeRef.current = onHeadingsChange
  onUploadImageRef.current = onUploadImage
  resolveImageUrlRef.current = resolveImageUrl
  onNavigateNodeRef.current = onNavigateNode

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // 手动按需添加 feature，避免打包 CodeMirror / KaTeX / AI / 图片块等大体积依赖。
    const crepe = new CrepeBuilder({ root, defaultValue })
      .addFeature(cursor)
      .addFeature(listItem)
      .addFeature(linkTooltip, {
        inputPlaceholder: '粘贴链接…',
        onCopyLink: (link) => void navigator.clipboard?.writeText(link),
      })
      .addFeature(imageBlock, {
        onUpload: async (file) => {
          const upload = onUploadImageRef.current
          if (!upload) throw new Error('当前文档不支持图片上传')
          return upload(file)
        },
        proxyDomURL: (url) => resolveImageUrlRef.current?.(url) ?? url,
        inlineUploadButton: '上传图片',
        inlineUploadPlaceholderText: '或粘贴图片链接',
        blockUploadButton: '上传图片',
        blockConfirmButton: '确认',
        blockCaptionPlaceholderText: '图片说明',
        blockUploadPlaceholderText: '或粘贴图片链接',
      })
      .addFeature(blockEdit, {
        blockHandle: {
          getOffset: () => 7,
        },
        textGroup: {
          label: '文本',
          text: { label: '正文' },
          h1: { label: '一级标题' },
          h2: { label: '二级标题' },
          h3: { label: '三级标题' },
          h4: { label: '四级标题' },
          h5: { label: '五级标题' },
          h6: { label: '六级标题' },
          quote: { label: '引用' },
          divider: { label: '分割线' },
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '任务列表' },
        },
        advancedGroup: {
          label: '高级',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
          math: null,
        },
      })
      .addFeature(placeholder)
      .addFeature(toolbar)
      .addFeature(table)

    void crepe.editor.remove(tableBlockView)
    crepe.editor.use(activeHeadingSyntax)

    crepeRef.current = crepe

    const internalNodeId = (href: string): string | null => {
      try {
        const url = new URL(href)
        if (url.hostname === 'figma-md.local' && url.pathname.startsWith('/node/')) {
          return decodeURIComponent(url.pathname.slice('/node/'.length))
        }
        if (!/(^|\.)figma\.com$/.test(url.hostname)) return null
        const nodeId = url.searchParams.get('node-id')
        if (!nodeId) return null
        return nodeId.includes(':') ? nodeId : nodeId.replace('-', ':')
      } catch {
        return null
      }
    }

    const handleInternalLink = (event: MouseEvent) => {
      const target = event.target
      const anchor = target instanceof Element ? target.closest('a') : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      const nodeId = internalNodeId(anchor.href)
      if (!nodeId) return
      event.preventDefault()
      onNavigateNodeRef.current?.(nodeId)
    }
    root.addEventListener('click', handleInternalLink)

    // 点击唯一的行手柄打开插入菜单；按住并移动仍使用 Milkdown 原生行拖拽。
    const handleBlockHandleClick = (event: MouseEvent) => {
      const target = event.target
      const operation = target instanceof Element
        ? target.closest('.milkdown-block-handle .operation-item:last-child')
        : null
      if (!(operation instanceof HTMLElement)) return
      const addButton = operation.parentElement?.querySelector<HTMLElement>('.operation-item:first-child')
      if (!addButton) return
      event.preventDefault()
      event.stopPropagation()
      addButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
      addButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
    }
    root.addEventListener('click', handleBlockHandleClick)

    // 使用原生 ProseMirror 表格编辑，避免 Vue TableNodeView 在中文输入法组合输入时重绘单元格。
    // 行列操作单独渲染为轻量浮层，不启用列宽拖拽。
    const tableActions = document.createElement('div')
    tableActions.className = 'figma-md-table-actions'
    tableActions.hidden = true
    tableActions.innerHTML = `
      <button type="button" data-table-action="add-row" title="在下方添加行" aria-label="在下方添加行">+ 行</button>
      <button type="button" data-table-action="add-col" title="在右侧添加列" aria-label="在右侧添加列">+ 列</button>
    `
    root.appendChild(tableActions)
    let activeTableCell: HTMLTableCellElement | null = null

    const showTableActions = (cell: HTMLTableCellElement) => {
      activeTableCell = cell
      tableActions.hidden = false
      const tableRect = cell.closest('table')?.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      if (!tableRect) return
      const left = Math.max(
        8,
        Math.min(root.clientWidth - tableActions.offsetWidth - 8, tableRect.right - rootRect.left - tableActions.offsetWidth),
      )
      tableActions.style.left = `${left + root.scrollLeft}px`
      tableActions.style.top = `${Math.max(4, tableRect.top - rootRect.top + root.scrollTop - 30)}px`
    }

    const handleTablePointerMove = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.figma-md-table-actions')) return
      const cell = target.closest('td, th')
      if (cell instanceof HTMLTableCellElement && cell.closest('.ProseMirror')) {
        if (cell !== activeTableCell) showTableActions(cell)
        return
      }
      tableActions.hidden = true
      activeTableCell = null
    }

    const handleTableFocus = (event: FocusEvent) => {
      const target = event.target
      const cell = target instanceof Element ? target.closest('td, th') : null
      if (cell instanceof HTMLTableCellElement) showTableActions(cell)
    }

    const handleTableAction = (event: PointerEvent) => {
      const target = event.target
      const button = target instanceof Element ? target.closest<HTMLButtonElement>('[data-table-action]') : null
      const cell = activeTableCell
      if (!button || !cell) return
      event.preventDefault()
      event.stopPropagation()
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        if (!view.editable || !cell.isConnected) return
        const cellPos = view.posAtDOM(cell, 0)
        const selection = TextSelection.near(view.state.doc.resolve(cellPos), 1)
        view.dispatch(view.state.tr.setSelection(selection))
        const commands = ctx.get(commandsCtx)
        if (button.dataset.tableAction === 'add-row') commands.call(addRowAfterCommand.key)
        if (button.dataset.tableAction === 'add-col') commands.call(addColAfterCommand.key)
        view.focus()
      })
    }

    const handleLinkBoundarySpace = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.defaultPrevented || event.isComposing || readonly) return
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { state } = view
        if (!state.selection.empty) return
        const linkType = state.schema.marks.link
        if (!linkType) return
        const { $from } = state.selection
        const beforeLink = linkType.isInSet($from.nodeBefore?.marks ?? [])
        const afterLink = linkType.isInSet($from.nodeAfter?.marks ?? [])
        // 仅在链接首尾边界退出；链接内部的空格仍属于链接标题。
        if ((!beforeLink && !afterLink) || (beforeLink && afterLink)) return
        event.preventDefault()
        const pos = state.selection.from
        const activeMarks = state.storedMarks ?? $from.marks()
        const transaction = state.tr.insertText(' ', pos)
        transaction.removeMark(pos, pos + 1, linkType)
        transaction.setStoredMarks(activeMarks.filter((mark) => mark.type !== linkType))
        view.dispatch(transaction.scrollIntoView())
      })
    }

    root.addEventListener('pointermove', handleTablePointerMove)
    root.addEventListener('focusin', handleTableFocus)
    tableActions.addEventListener('pointerdown', handleTableAction)
    root.addEventListener('keydown', handleLinkBoundarySpace)

    let imageResizeCleanup: (() => void) | null = null

    const findImageNode = (block: HTMLElement) => {
      try {
        const view = crepe.editor.ctx.get(editorViewCtx)
        const rawPos = view.posAtDOM(block, 0)
        for (const pos of [rawPos, rawPos - 1, rawPos + 1]) {
          if (pos < 0) continue
          const node = view.state.doc.nodeAt(pos)
          if (node?.type.name === 'image-block') return { view, node, pos }
        }
      } catch {
        // 编辑器挂载早期尚未创建 EditorView，等待下一次 DOM 变化再同步。
      }
      return null
    }

    const applyImageLayouts = () => {
      root.querySelectorAll<HTMLElement>('.milkdown-image-block').forEach((block) => {
        const wrapper = block.querySelector<HTMLElement>('.image-wrapper')
        const image = wrapper?.querySelector<HTMLImageElement>('img')
        if (!wrapper || !image) return
        const match = findImageNode(block)
        const ratio = Number(match?.node.attrs.ratio ?? 1)
        const manualWidth = ratio < 0 ? Math.max(120, Math.min(1600, Math.abs(ratio))) : null
        wrapper.style.setProperty('width', manualWidth ? `${manualWidth}px` : '100%', 'important')
        wrapper.dataset.manualSize = manualWidth ? 'true' : 'false'
        image.style.setProperty('width', '100%', 'important')
        image.style.setProperty('height', 'auto', 'important')
        image.style.setProperty('max-width', 'none', 'important')
      })

      root.querySelectorAll<HTMLElement>('.milkdown-block-handle').forEach((handle) => {
        const dragButton = handle.querySelector<HTMLElement>('.operation-item:last-child')
        if (!dragButton) return
        dragButton.title = '点击插入区块，按住拖动本行'
        dragButton.setAttribute('aria-label', '插入区块或拖动本行')
      })
    }

    const observer = new MutationObserver((mutations) => {
      const needsLayout = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false
          return node.matches('.milkdown-image-block, .milkdown-block-handle') ||
            node.querySelector('.milkdown-image-block, .milkdown-block-handle') !== null
        }),
      )
      if (needsLayout) requestAnimationFrame(applyImageLayouts)
    })
    observer.observe(root, { childList: true, subtree: true })

    const handleImageResizeStart = (event: PointerEvent) => {
      const target = event.target
      const handle = target instanceof Element ? target.closest('.image-resize-handle') : null
      const block = handle?.closest<HTMLElement>('.milkdown-image-block')
      const wrapper = block?.querySelector<HTMLElement>('.image-wrapper')
      if (!(handle instanceof HTMLElement) || !block || !wrapper || readonly) return
      const match = findImageNode(block)
      if (!match) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const startX = event.clientX
      const startWidth = wrapper.getBoundingClientRect().width

      const handleMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault()
        const width = Math.max(120, Math.min(1600, Math.round(startWidth + moveEvent.clientX - startX)))
        wrapper.style.setProperty('width', `${width}px`, 'important')
        wrapper.dataset.manualSize = 'true'
      }

      const handleEnd = () => {
        window.removeEventListener('pointermove', handleMove, true)
        window.removeEventListener('pointerup', handleEnd, true)
        window.removeEventListener('pointercancel', handleEnd, true)
        imageResizeCleanup = null
        const width = Math.max(120, Math.min(1600, Math.round(wrapper.getBoundingClientRect().width)))
        const current = match.view.state.doc.nodeAt(match.pos)
        if (current?.type.name !== 'image-block') return
        match.view.dispatch(
          match.view.state.tr.setNodeMarkup(match.pos, undefined, { ...current.attrs, ratio: -width }),
        )
        requestAnimationFrame(applyImageLayouts)
      }

      imageResizeCleanup?.()
      imageResizeCleanup = () => {
        window.removeEventListener('pointermove', handleMove, true)
        window.removeEventListener('pointerup', handleEnd, true)
        window.removeEventListener('pointercancel', handleEnd, true)
      }
      window.addEventListener('pointermove', handleMove, true)
      window.addEventListener('pointerup', handleEnd, true)
      window.addEventListener('pointercancel', handleEnd, true)
    }
    root.addEventListener('pointerdown', handleImageResizeStart, true)

    crepe.on((listener) => {
      listener.markdownUpdated((ctx, markdown) => {
        onChangeRef.current?.(markdown)
        onHeadingsChangeRef.current?.(extractHeadings(ctx))
      })
    })

    let disposed = false
    crepe
      .create()
      .then(() => {
        if (disposed) {
          void crepe.destroy()
          return
        }
        if (readonly) crepe.setReadonly(true)
        // 初始提取一次标题（markdownUpdated 在初始加载时不触发）
        const headings = crepe.editor.action((ctx) => extractHeadings(ctx))
        onHeadingsChangeRef.current?.(headings)
        setReady(true)
        requestAnimationFrame(applyImageLayouts)
      })
      .catch((error: unknown) => {
        console.error('Milkdown Crepe 初始化失败', error)
      })

    return () => {
      disposed = true
      root.removeEventListener('click', handleInternalLink)
      root.removeEventListener('click', handleBlockHandleClick)
      root.removeEventListener('pointermove', handleTablePointerMove)
      root.removeEventListener('focusin', handleTableFocus)
      tableActions.removeEventListener('pointerdown', handleTableAction)
      root.removeEventListener('keydown', handleLinkBoundarySpace)
      tableActions.remove()
      root.removeEventListener('pointerdown', handleImageResizeStart, true)
      observer.disconnect()
      imageResizeCleanup?.()
      void crepe.destroy()
      crepeRef.current = null
    }
    // 编辑器仅在挂载时创建一次，defaultValue 只作为初始值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // readonly 切换时同步到编辑器（预览/编辑模式切换）
  useEffect(() => {
    if (ready) {
      crepeRef.current?.setReadonly(readonly ?? false)
    }
  }, [readonly, ready])

  const getMarkdown = useCallback(() => crepeRef.current?.getMarkdown() ?? '', [])

  const setMarkdown = useCallback((markdown: string) => {
    crepeRef.current?.editor.action(replaceAll(markdown))
  }, [])

  const scrollToHeading = useCallback((pos: number) => {
    crepeRef.current?.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const node = view.nodeDOM(pos)
      const target = node instanceof HTMLElement ? node : node?.parentElement
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const insertFrameLink = useCallback((name: string, nodeId: string, url: string) => {
    crepeRef.current?.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      const href = url.trim()
      if (!href.startsWith('https://www.figma.com/')) return
      const label = state.selection.empty
        ? name
        : state.doc.textBetween(state.selection.from, state.selection.to, ' ') || name
      const linkType = state.schema.marks.link
      if (!linkType) return
      const from = state.selection.from
      const transaction = state.tr.insertText(label, from, state.selection.to)
      const to = from + label.length
      transaction.addMark(from, to, linkType.create({ href, title: null }))
      if (!transaction.doc.rangeHasMark(from, to, linkType)) return
      transaction.setSelection(TextSelection.create(transaction.doc, to))
      view.dispatch(transaction.scrollIntoView())
      view.focus()
      queueMicrotask(() => {
        const latestMarkdown = crepeRef.current?.getMarkdown()
        if (latestMarkdown !== undefined) onChangeRef.current?.(latestMarkdown)
      })
    })
    void nodeId
  }, [])

  const appendMarkdown = useCallback((markdown: string) => {
    const imported = markdown.replace(/\r\n?/g, '\n').trim()
    if (!imported) return
    const current = crepeRef.current?.getMarkdown().trimEnd() ?? ''
    const combined = current ? `${current}\n\n${imported}\n` : `${imported}\n`
    crepeRef.current?.editor.action(replaceAll(combined))
    requestAnimationFrame(() => {
      crepeRef.current?.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const end = view.state.doc.content.size
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end), -1)).scrollIntoView())
        view.focus()
      })
      const latestMarkdown = crepeRef.current?.getMarkdown()
      if (latestMarkdown !== undefined) onChangeRef.current?.(latestMarkdown)
    })
  }, [])

  return {
    rootRef,
    crepeRef,
    ready,
    getMarkdown,
    setMarkdown,
    scrollToHeading,
    insertFrameLink,
    appendMarkdown,
  }
}
