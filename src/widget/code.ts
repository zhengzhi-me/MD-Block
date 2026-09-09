import type { PluginMessage, UIMessage, WidgetImageAsset } from '../shared/messages'
import {
  parseWidgetMarkdown,
  type WidgetInlineSegment,
  type WidgetMarkdownBlock,
  type WidgetTableAlignment,
} from './markdown'

const { widget } = figma
const { h, AutoLayout, Frame, Image, Rectangle, Span, Text, useSyncedState, useWidgetNodeId } = widget

const CONTENT_WIDTH = 720
const CANVAS_NODE_BUDGET = 360
const CANVAS_FONT_FAMILY = 'Noto Sans SC'
const WIDGET_SCHEMA_VERSION = 3
const DOCUMENT_FILE_KEY_DATA = 'md-block-figma-file-key-v1'
let suppressEditorOpenUntil = 0

function findSelectedSceneNode(currentWidgetId: string): SceneNode | null {
  return figma.currentPage.selection.find((node) => node.id !== currentWidgetId && isSceneNode(node)) ?? null
}

function extractFigmaFileKey(input: string): string | null {
  // Widget 主线程没有浏览器的 URL 全局对象，使用纯字符串解析以兼容个人草稿和发布版。
  const normalized = input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
  const match = normalized.match(
    /(?:https?:\/\/)?(?:www\.)?figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9_-]+)/i,
  )
  return match?.[1] ?? null
}

function createNodeUrl(node: SceneNode, fileKey: string): string {
  const slug = encodeURIComponent(figma.root.name || 'Figma').replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  const nodeId = encodeURIComponent(node.id.replace(':', '-'))
  // 使用 Figma 可识别为当前文件节点的规范 URL；额外编码 ASCII 括号，避免截断 Markdown 链接。
  return `https://www.figma.com/design/${encodeURIComponent(fileKey)}/${slug}?node-id=${nodeId}`
}

function containingPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node
  while (current && current.type !== 'PAGE') current = current.parent
  return current?.type === 'PAGE' ? current : null
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return node.type !== 'DOCUMENT' && node.type !== 'PAGE'
}

function figmaNodeIdFromHref(href?: string): string | null {
  if (!href || !/^https:\/\/(?:www\.)?figma\.com\//i.test(href)) return null
  const match = href.match(/[?&]node-id=([^&#]+)/i)
  if (!match?.[1]) return null
  try {
    const nodeId = decodeURIComponent(match[1])
    return nodeId.includes(':') ? nodeId : nodeId.replace('-', ':')
  } catch {
    return null
  }
}

async function navigateToFigmaNode(nodeId: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || !isSceneNode(node)) {
      figma.notify('对应画板或图层已不存在。', { error: true })
      return
    }
    const page = containingPage(node)
    if (page && page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page)
    figma.currentPage.selection = [node]
    figma.viewport.scrollAndZoomIntoView([node])
    figma.notify(`已定位到「${node.name}」`)
  } catch {
    figma.notify('无法定位对应画板或图层。', { error: true })
  }
}

async function handleFigmaNodeClick(nodeId: string): Promise<void> {
  // Widget 子节点与根节点点击会同时触发；先阻止本次根节点打开编辑器。
  suppressEditorOpenUntil = Date.now() + 500
  try {
    figma.ui.close()
  } catch {
    // 当前没有打开 UI 时无需处理。
  }
  await navigateToFigmaNode(nodeId)
}

function imageSize(asset: WidgetImageAsset, manualWidth?: number): { width: number; height: number } {
  const sourceWidth = Math.max(asset.width, 1)
  const sourceHeight = Math.max(asset.height, 1)
  const width = manualWidth
    ? Math.max(120, Math.min(1600, Math.round(manualWidth)))
    : CONTENT_WIDTH
  return { width, height: Math.max(80, Math.round((sourceHeight / sourceWidth) * width)) }
}

function renderInline(segments: WidgetInlineSegment[], key: string) {
  return segments.map((segment, index) =>
    h(
      Span,
      segment.href
        ? {
            key: `${key}-${index}`,
            href: segment.href,
            fill: '#2563EB',
            textDecoration: 'underline',
          }
        : { key: `${key}-${index}` },
      segment.text,
    ),
  )
}

type InlineTextProps = Parameters<typeof Text>[0]

function renderInlineText(
  segments: WidgetInlineSegment[],
  key: string,
  props: InlineTextProps,
  maxWidth = CONTENT_WIDTH,
) {
  const internalNodeIds = segments.map((segment) => figmaNodeIdFromHref(segment.href))
  if (!internalNodeIds.some(Boolean)) {
    return h(Text, { fontFamily: CANVAS_FONT_FAMILY, ...props, key }, renderInline(segments, key))
  }

  const standaloneNodeId = segments.length === 1 ? internalNodeIds[0] : null
  if (standaloneNodeId) {
    return h(
      Text,
      {
        fontFamily: CANVAS_FONT_FAMILY,
        ...props,
        key,
        fill: '#2563EB',
        textDecoration: 'underline',
        onClick: () => handleFigmaNodeClick(standaloneNodeId),
        tooltip: '跳转到对应画板或图层',
        hoverStyle: { fill: '#1D4ED8' },
      },
      segments[0]?.text ?? ' ',
    )
  }

  const { width, key: _ignoredKey, ...segmentProps } = props
  const horizontalAlign = props.horizontalAlignText === 'right'
    ? 'end'
    : props.horizontalAlignText === 'center'
      ? 'center'
      : 'start'

  return h(
    AutoLayout,
    {
      key,
      width: width ?? 'fill-parent',
      direction: 'horizontal',
      wrap: true,
      spacing: 0,
      horizontalAlignItems: horizontalAlign,
      verticalAlignItems: 'start',
    },
    segments.map((segment, index) => {
      const nodeId = internalNodeIds[index] ?? null
      const linkStyle = segment.href
        ? { fill: '#2563EB' as const, textDecoration: 'underline' as const }
        : {}
      const interaction = nodeId
        ? {
            onClick: () => handleFigmaNodeClick(nodeId),
            tooltip: '跳转到对应画板或图层',
            hoverStyle: { fill: '#1D4ED8' as const },
          }
        : segment.href
          ? { href: segment.href }
          : {}
      return h(
        Text,
        {
          fontFamily: CANVAS_FONT_FAMILY,
          ...segmentProps,
          ...linkStyle,
          ...interaction,
          key: `${key}-${index}`,
          width: 'hug-contents',
          maxWidth,
        },
        segment.text,
      )
    }),
  )
}

function plainInlineLength(segments: WidgetInlineSegment[]): number {
  return segments.reduce((length, segment) => length + segment.text.length, 0)
}

function tableColumnWidths(block: Extract<WidgetMarkdownBlock, { type: 'table' }>): number[] {
  const columnCount = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1)
  const weights = Array.from({ length: columnCount }, (_, columnIndex) => {
    const lengths = [
      plainInlineLength(block.header[columnIndex] ?? []),
      ...block.rows.map((row) => plainInlineLength(row[columnIndex] ?? [])),
    ]
    return Math.max(1, Math.min(8, Math.sqrt(Math.max(...lengths, 1))))
  })
  const baseWidth = Math.min(84, Math.floor(CONTENT_WIDTH / columnCount))
  const remaining = Math.max(0, CONTENT_WIDTH - baseWidth * columnCount)
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
  const widths = weights.map((weight) => baseWidth + Math.floor((remaining * weight) / weightTotal))
  const total = widths.reduce((sum, width) => sum + width, 0)
  widths[widths.length - 1] = (widths[widths.length - 1] ?? 0) + CONTENT_WIDTH - total
  return widths
}

function tableRowHeight(cells: WidgetInlineSegment[][], widths: number[]): number {
  const lineCount = widths.reduce((maximum, width, columnIndex) => {
    const textLength = Math.max(1, plainInlineLength(cells[columnIndex] ?? []))
    const charactersPerLine = Math.max(1, Math.floor((width - 20) / 7))
    return Math.max(maximum, Math.ceil(textLength / charactersPerLine))
  }, 1)
  return Math.max(36, lineCount * 18 + 16)
}

function renderTableRow(
  cells: WidgetInlineSegment[][],
  widths: number[],
  align: WidgetTableAlignment[],
  key: string,
  header = false,
) {
  const height = tableRowHeight(cells, widths)
  return h(
    AutoLayout,
    { key, width: CONTENT_WIDTH, height, direction: 'horizontal', spacing: 0 },
    widths.map((width, columnIndex) =>
      h(
        AutoLayout,
        {
          key: `${key}-cell-${columnIndex}`,
          width,
          height,
          padding: { top: 8, right: 10, bottom: 8, left: 10 },
          fill: header ? '#F5F5F5' : '#FFFFFF',
          stroke: '#E5E5E5',
          strokeWidth: 1,
        },
        renderInlineText(
          cells[columnIndex] ?? [{ text: ' ' }],
          `${key}-inline-${columnIndex}`,
          {
            width: Math.max(1, width - 20),
            fontSize: 12,
            fontWeight: header ? 600 : 400,
            lineHeight: '145%',
            fill: '#262626',
            horizontalAlignText: align[columnIndex] ?? 'left',
          },
          Math.max(1, width - 20),
        ),
      ),
    ),
  )
}

function blockRenderCost(block: WidgetMarkdownBlock): number {
  if (block.type === 'table') {
    const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1)
    return 2 + (block.rows.length + 1) * (columns * 2 + 1)
  }
  if (block.type === 'image' || block.type === 'quote' || block.type === 'bullet' || block.type === 'ordered') {
    return 4
  }
  return 2
}

function fitBlocksToCanvas(blocks: WidgetMarkdownBlock[]) {
  const visible: WidgetMarkdownBlock[] = []
  let budget = 0
  let truncated = false
  for (const block of blocks) {
    const cost = blockRenderCost(block)
    if (budget + cost > CANVAS_NODE_BUDGET) {
      if (block.type === 'table') {
        const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1)
        const rowCost = columns * 2 + 1
        const availableRows = Math.max(0, Math.floor((CANVAS_NODE_BUDGET - budget - 2) / rowCost) - 1)
        if (availableRows > 0) visible.push({ ...block, rows: block.rows.slice(0, availableRows) })
      }
      truncated = true
      break
    }
    visible.push(block)
    budget += cost
  }
  return { visible, truncated: truncated || visible.length < blocks.length }
}

function renderBlock(block: WidgetMarkdownBlock, index: number, assets: WidgetImageAsset[]) {
  const key = `block-${index}`

  switch (block.type) {
    case 'heading': {
      const sizes: Record<number, number> = { 1: 22, 2: 20, 3: 18, 4: 16, 5: 15, 6: 14 }
      return renderInlineText(
        block.inline,
        key,
        {
          key,
          name: `Heading ${block.level}`,
          width: 'fill-parent',
          fontSize: sizes[block.level] ?? 14,
          fontWeight: 700,
          lineHeight: '135%',
          fill: '#171717',
        },
      )
    }
    case 'bullet':
      return h(
        AutoLayout,
        { key, width: 'fill-parent', spacing: 8, verticalAlignItems: 'start' },
        [
          h(Text, { key: `${key}-marker`, fontFamily: CANVAS_FONT_FAMILY, fontSize: 14, lineHeight: '155%', fill: '#737373' }, '•'),
          renderInlineText(block.inline, `${key}-text`, { width: CONTENT_WIDTH - 24, fontSize: 14, lineHeight: '155%', fill: '#262626' }, CONTENT_WIDTH - 24),
        ],
      )
    case 'ordered':
      return h(
        AutoLayout,
        { key, width: 'fill-parent', spacing: 8, verticalAlignItems: 'start' },
        [
          h(Text, { key: `${key}-marker`, fontFamily: CANVAS_FONT_FAMILY, fontSize: 14, lineHeight: '155%', fill: '#737373' }, `${block.order}.`),
          renderInlineText(block.inline, `${key}-text`, { width: CONTENT_WIDTH - 32, fontSize: 14, lineHeight: '155%', fill: '#262626' }, CONTENT_WIDTH - 32),
        ],
      )
    case 'quote':
      return h(
        AutoLayout,
        {
          key,
          width: 'fill-parent',
          spacing: 10,
          padding: { top: 6, right: 10, bottom: 6, left: 0 },
          fill: '#FAFAFA',
          cornerRadius: 4,
        },
        [
          h(Rectangle, { key: `${key}-bar`, width: 3, height: 'fill-parent', fill: '#A3A3A3', cornerRadius: 2 }),
          renderInlineText(block.inline, `${key}-text`, { width: CONTENT_WIDTH - 36, fontSize: 14, lineHeight: '155%', fill: '#525252' }, CONTENT_WIDTH - 36),
        ],
      )
    case 'code':
      return h(
        AutoLayout,
        {
          key,
          width: 'fill-parent',
          padding: 14,
          fill: '#F5F5F5',
          cornerRadius: 6,
          overflow: 'hidden',
        },
        h(
          Text,
          { width: CONTENT_WIDTH - 28, fontFamily: 'Roboto Mono', fontSize: 12, lineHeight: '155%', fill: '#262626' },
          block.text,
        ),
      )
    case 'divider':
      return h(Frame, { key, width: 'fill-parent', height: 1, fill: '#E5E5E5' })
    case 'spacer':
      return h(Frame, { key, width: 'fill-parent', height: 10 })
    case 'table': {
      const widths = tableColumnWidths(block)
      return h(
        AutoLayout,
        { key, width: CONTENT_WIDTH, direction: 'vertical', spacing: 0, cornerRadius: 6, overflow: 'hidden' },
        [
          renderTableRow(block.header, widths, block.align, `${key}-header`, true),
          ...block.rows.map((row, rowIndex) =>
            renderTableRow(row, widths, block.align, `${key}-row-${rowIndex}`),
          ),
        ],
      )
    }
    case 'image': {
      const asset = assets.find((candidate) => candidate.id === block.assetId)
      if (!asset) {
        return h(
          AutoLayout,
          { key, width: 'fill-parent', padding: 12, fill: '#FAFAFA', cornerRadius: 6 },
          h(Text, { fontFamily: CANVAS_FONT_FAMILY, fontSize: 12, fill: '#A3A3A3' }, `图片附件不可用：${block.alt}`),
        )
      }
      const size = imageSize(asset, block.manualWidth)
      return h(
        AutoLayout,
        { key, width: 'fill-parent', direction: 'vertical', spacing: 6, horizontalAlignItems: 'center' },
        [
          h(Image, {
            key: `${key}-image`,
            src: asset.dataUrl,
            width: size.width,
            height: size.height,
            cornerRadius: 6,
          }),
          h(Text, { key: `${key}-caption`, fontFamily: CANVAS_FONT_FAMILY, fontSize: 12, fill: '#737373' }, block.alt || asset.name),
        ],
      )
    }
    case 'paragraph':
    default:
      return renderInlineText(
        block.inline,
        key,
        { width: 'fill-parent', fontSize: 14, lineHeight: '155%', fill: '#262626' },
      )
  }
}

function MarkdownBlockWidget() {
  const widgetNodeId = useWidgetNodeId()
  const [title, setTitle] = useSyncedState('title', '未命名')
  const [markdown, setMarkdown] = useSyncedState('markdown', '')
  const [assets, setAssets] = useSyncedState<WidgetImageAsset[]>('assets', [])
  const [figmaFileKey, setFigmaFileKey] = useSyncedState('figmaFileKey', '')
  const [schemaVersion] = useSyncedState('schemaVersion', WIDGET_SCHEMA_VERSION)
  const blocks = parseWidgetMarkdown(markdown)
  const { visible: visibleBlocks, truncated } = fitBlocksToCanvas(blocks)
  const renderedBlocks = visibleBlocks.map((block, index) => renderBlock(block, index, assets))

  // Figma 只允许 can-edit 用户触发 Widget 事件；查看者直接阅读下面渲染到画布的内容。
  const openEditor = async (): Promise<void> => {
    // 给内部节点链接的点击事件留出一次事件循环，避免父级点击同时打开编辑器。
    await new Promise<void>((resolve) => setTimeout(resolve, 80))
    if (Date.now() < suppressEditorOpenUntil) return
    return new Promise<void>((resolve) => {
      let resizeOrigin: Vector | null = null
      const documentFileKey = figma.root.getPluginData(DOCUMENT_FILE_KEY_DATA)
      // V0.2.0 的逐 Widget 配置迁移为文件级配置；新版本复制到其他文件后仍需重新绑定，避免误链。
      const legacyFileKey = schemaVersion < WIDGET_SCHEMA_VERSION ? figmaFileKey : ''
      let sessionFileKey = documentFileKey || legacyFileKey
      if (!documentFileKey && legacyFileKey) {
        figma.root.setPluginData(DOCUMENT_FILE_KEY_DATA, legacyFileKey)
      }
      let settled = false
      let lastHeartbeat = Date.now()
      let watchdog: ReturnType<typeof setInterval> | null = null

      const finishSession = () => {
        if (settled) return
        settled = true
        if (watchdog) clearInterval(watchdog)
        figma.off('close', handleClose)
        resolve()
      }

      const handleClose = () => {
        finishSession()
      }

      const upgradeLegacyWidgetsOnCurrentPage = () => {
        const widgetId = figma.widgetId
        if (!widgetId) return 0
        let upgraded = 0
        const legacyFileKeys = new Set<string>()
        for (const node of figma.currentPage.findWidgetNodesByWidgetId(widgetId)) {
          if (node.id === widgetNodeId) continue
          const previous = node.widgetSyncedState
          if (typeof previous.figmaFileKey === 'string' && previous.figmaFileKey) {
            legacyFileKeys.add(previous.figmaFileKey)
          }
          if (previous.schemaVersion === WIDGET_SCHEMA_VERSION) continue
          const migrated = {
            ...previous,
            title: typeof previous.title === 'string' ? previous.title : '未命名',
            markdown: typeof previous.markdown === 'string'
              ? previous.markdown
              : typeof previous.content === 'string'
                ? previous.content
                : '',
            assets: Array.isArray(previous.assets) ? previous.assets : [],
            figmaFileKey: typeof previous.figmaFileKey === 'string' ? previous.figmaFileKey : '',
            schemaVersion: WIDGET_SCHEMA_VERSION,
          }
          node.setWidgetSyncedState(migrated)
          upgraded += 1
        }
        // 仅当当前页面旧实例指向同一文件时自动迁移，存在冲突则要求用户重新绑定。
        if (!sessionFileKey && legacyFileKeys.size === 1) {
          sessionFileKey = Array.from(legacyFileKeys)[0] ?? ''
          if (sessionFileKey) figma.root.setPluginData(DOCUMENT_FILE_KEY_DATA, sessionFileKey)
        }
        return upgraded
      }

      const upgradedCount = upgradeLegacyWidgetsOnCurrentPage()
      if (upgradedCount > 0) figma.notify(`已保留数据并升级 ${upgradedCount} 个旧版 MD Block`)

      figma.showUI(__html__, {
        width: 480,
        height: 640,
        title: 'MD Block',
        themeColors: true,
      })

      figma.on('close', handleClose)
      watchdog = setInterval(() => {
        // Figma 偶尔不会把长会话的 UI close 事件送回 Widget；心跳停止后主动释放事件。
        if (Date.now() - lastHeartbeat > 12000) finishSession()
      }, 3000)

      figma.ui.onmessage = async (message: PluginMessage) => {
        const insertSelectedFrameLink = (fileKey: string) => {
          const selectedNode = findSelectedSceneNode(widgetNodeId)
          if (!selectedNode) {
            figma.ui.postMessage({
              type: 'error',
              message: '请先在画布中选择一个画板或图层，再点击插入按钮。',
            } satisfies UIMessage)
            return
          }
          figma.ui.postMessage({
            type: 'frame-link-ready',
            nodeId: selectedNode.id,
            name: selectedNode.name || '未命名图层',
            url: createNodeUrl(selectedNode, fileKey),
          } satisfies UIMessage)
        }

        switch (message.type) {
          case 'ui-heartbeat':
            lastHeartbeat = Date.now()
            break
          case 'ui-closing':
            finishSession()
            break
          case 'ready':
            lastHeartbeat = Date.now()
            figma.ui.postMessage({
              type: 'init',
              data: { title, markdown, assets, figmaFileKey: sessionFileKey },
              canEdit: true,
            } satisfies UIMessage)
            break
          case 'save':
            setTitle(message.data.title)
            setMarkdown(message.data.markdown)
            if (message.data.figmaFileKey !== undefined) {
              sessionFileKey = message.data.figmaFileKey
              setFigmaFileKey(sessionFileKey)
            }
            setAssets(
              message.data.assets.filter((asset) =>
                message.data.markdown.includes(`figma-asset://${asset.id}`),
              ),
            )
            figma.ui.postMessage({ type: 'saved' } satisfies UIMessage)
            break
          case 'resize-start':
            resizeOrigin = figma.ui.getPosition().canvasSpace
            break
          case 'resize': {
            const origin = resizeOrigin
            if (origin && (message.offsetX !== 0 || message.offsetY !== 0)) {
              const zoom = Math.max(figma.viewport.zoom, 0.01)
              figma.ui.reposition(
                origin.x + message.offsetX / zoom,
                origin.y + message.offsetY / zoom,
              )
            }
            figma.ui.resize(message.width, message.height)
            break
          }
          case 'resize-end':
            resizeOrigin = null
            break
          case 'insert-selected-frame': {
            if (!sessionFileKey) {
              figma.ui.postMessage({ type: 'file-link-required' } satisfies UIMessage)
              break
            }
            insertSelectedFrameLink(sessionFileKey)
            break
          }
          case 'set-figma-file-url': {
            const fileKey = extractFigmaFileKey(message.url)
            if (!fileKey) {
              figma.ui.postMessage({
                type: 'error',
                message: '无法识别该文件链接。请在当前 Figma 文件中复制文件链接后重试。',
              } satisfies UIMessage)
              break
            }
            sessionFileKey = fileKey
            figma.root.setPluginData(DOCUMENT_FILE_KEY_DATA, fileKey)
            setFigmaFileKey(fileKey)
            figma.ui.postMessage({ type: 'file-link-configured', fileKey } satisfies UIMessage)
            if (message.insertSelected) insertSelectedFrameLink(fileKey)
            break
          }
          case 'navigate-node': {
            const node = await figma.getNodeByIdAsync(message.nodeId)
            if (!node || !isSceneNode(node)) {
              figma.ui.postMessage({ type: 'error', message: '对应画板已不存在。' } satisfies UIMessage)
              break
            }
            const page = containingPage(node)
            if (page && page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page)
            figma.currentPage.selection = [node]
            figma.viewport.scrollAndZoomIntoView([node])
            figma.notify(`已定位到「${node.name}」`)
            break
          }
          case 'notify':
            figma.notify(message.message)
            break
        }
      }
    })
  }

  return h(
    AutoLayout,
    {
      name: 'MD Block',
      width: 760,
      direction: 'vertical',
      spacing: 14,
      padding: { top: 24, right: 20, bottom: 24, left: 20 },
      cornerRadius: 10,
      fill: '#FFFFFF',
      stroke: '#E5E5E5',
      strokeWidth: 1,
      onClick: openEditor,
    },
    [
      h(Text, { key: 'document-title', width: 'fill-parent', fontFamily: CANVAS_FONT_FAMILY, fontSize: 20, fontWeight: 700, lineHeight: '135%', fill: '#171717' }, title || '未命名'),
      h(Rectangle, { key: 'document-divider', width: 'fill-parent', height: 1, fill: '#E5E5E5' }),
      ...(visibleBlocks.length > 0
        ? renderedBlocks
        : [h(Text, { key: 'empty-state', width: 'fill-parent', fontFamily: CANVAS_FONT_FAMILY, fontSize: 14, fill: '#A3A3A3' }, '暂无 Markdown 内容')]),
      ...(truncated
        ? [
            h(
              Text,
              { key: 'content-truncated', width: 'fill-parent', fontFamily: CANVAS_FONT_FAMILY, fontSize: 12, fill: '#737373' },
              '内容较多，画布仅展示部分内容 · 点击打开完整文档',
            ),
          ]
        : []),
    ],
  )
}

widget.register(MarkdownBlockWidget)
