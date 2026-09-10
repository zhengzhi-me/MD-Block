export interface WidgetInlineSegment {
  text: string
  href?: string
}

export type WidgetTableAlignment = 'left' | 'center' | 'right'

export type WidgetMarkdownBlock =
  | { type: 'heading'; level: number; inline: WidgetInlineSegment[] }
  | { type: 'paragraph'; inline: WidgetInlineSegment[] }
  | { type: 'bullet'; inline: WidgetInlineSegment[] }
  | { type: 'ordered'; inline: WidgetInlineSegment[]; order: number }
  | { type: 'quote'; inline: WidgetInlineSegment[] }
  | { type: 'code'; text: string }
  | { type: 'divider' }
  | { type: 'spacer' }
  | { type: 'image'; assetId?: string; src?: string; alt: string; manualWidth?: number }
  | {
      type: 'table'
      header: WidgetInlineSegment[][]
      rows: WidgetInlineSegment[][][]
      align: WidgetTableAlignment[]
    }

function cleanInlineText(markdown: string): string {
  return markdown
    .replace(/(`{1,3}|\*\*|__|~~|\*|_)(.*?)\1/g, '$2')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
}

function cleanLinkHref(markdown: string): string {
  const unwrapped = markdown.startsWith('<') && markdown.endsWith('>')
    ? markdown.slice(1, -1)
    : markdown
  // Markdown 序列化器可能对 URL 中的 &、括号等字符增加反斜杠。
  const cleaned = unwrapped.replace(/\\(.)/g, '$1')
  // 兼容短暂生成过的不含 file_name 路径段的节点地址；旧 slug 无需等于当前文件名。
  return cleaned.replace(
    /^(https:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/[A-Za-z0-9_-]+)(\?node-id=)/i,
    '$1/Figma$2',
  )
}

function parseStandaloneImage(markdown: string): {
  alt: string
  href: string
  title: string
} | null {
  const match = /^\s*!\[([^\]]*)\]\(\s*((?:<[^>\n]+>)|(?:\\.|[^()\s]|\([^()\s]*\))+)(?:\s+(['"])(.*?)\3)?\s*\)\s*$/.exec(markdown)
  if (!match?.[2]) return null
  return {
    alt: cleanInlineText(match[1] ?? ''),
    href: cleanLinkHref(match[2]),
    title: cleanInlineText(match[4] ?? ''),
  }
}

export function parseInline(markdown: string): WidgetInlineSegment[] {
  if (isVisualBlank(markdown)) return [{ text: ' ' }]
  const segments: WidgetInlineSegment[] = []
  // 支持 URL 中的一层配对括号，兼容旧版以 Figma 文件名作为路径 slug 的节点链接。
  const linkPattern = /(!?)\[([^\]]*)\]\(((?:<[^>\n]+>)|(?:\\.|[^()\s]|\([^()\s]*\))+)(?:\s+['"][^'"]*['"])?\)/g
  let cursor = 0

  const append = (text: string, href?: string) => {
    const cleaned = cleanInlineText(text)
    if (!cleaned) return
    const previous = segments[segments.length - 1]
    if (previous && previous.href === href) previous.text += cleaned
    else segments.push(href ? { text: cleaned, href } : { text: cleaned })
  }

  for (const match of markdown.matchAll(linkPattern)) {
    const offset = match.index ?? 0
    append(markdown.slice(cursor, offset))
    // 行内图片在 Widget 中不重复显示资源，只保留替代文本。
    append(match[2] || '', match[1] ? undefined : cleanLinkHref(match[3] ?? ''))
    cursor = offset + match[0].length
  }
  append(markdown.slice(cursor))

  if (segments.length === 0) return [{ text: ' ' }]
  segments[0]!.text = segments[0]!.text.replace(/^\s+/, '')
  segments[segments.length - 1]!.text = segments[segments.length - 1]!.text.replace(/\s+$/, '')
  return segments.filter((segment) => segment.text.length > 0)
}

function isVisualBlank(line: string): boolean {
  const value = line.trim()
  return /^<br\s*\/?\s*>$/i.test(value) || /^#{1,6}$/.test(value)
}

function splitTableRow(line: string): string[] {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let escaped = false

  for (const character of source) {
    if (escaped) {
      current += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
      current += character
    } else if (character === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  cells.push(current.trim())
  return cells
}

function parseTableDelimiter(line: string): WidgetTableAlignment[] | null {
  const cells = splitTableRow(line)
  if (cells.length === 0 || cells.some((cell) => !/^:?-{3,}:?$/.test(cell))) return null
  return cells.map((cell) => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
    if (cell.endsWith(':')) return 'right'
    return 'left'
  })
}

function startsTable(lines: string[], index: number): boolean {
  const current = lines[index] ?? ''
  const next = lines[index + 1] ?? ''
  return current.includes('|') && parseTableDelimiter(next) !== null
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? ''
  return (
    /^\s*$/.test(line) ||
    isVisualBlank(line) ||
    startsTable(lines, index) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*```/.test(line) ||
    /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line) ||
    parseStandaloneImage(line) !== null
  )
}

/** 将 Markdown 转成适合 Widget 画布只读展示的轻量块结构。 */
export function parseWidgetMarkdown(markdown: string): WidgetMarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: WidgetMarkdownBlock[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (!line.trim()) continue

    if (isVisualBlank(line)) {
      blocks.push({ type: 'spacer' })
      continue
    }

    if (/^\s*```/.test(line)) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '')
        index += 1
      }
      blocks.push({ type: 'code', text: code.join('\n') || ' ' })
      continue
    }

    const image = parseStandaloneImage(line)
    if (image) {
      const ratioOrAlt = image.alt
      const ratio = Number(ratioOrAlt)
      const assetId = image.href.startsWith('figma-asset://')
        ? image.href.slice('figma-asset://'.length)
        : undefined
      const embeddedSrc = image.href.startsWith('data:image/') ? image.href : undefined
      blocks.push({
        type: 'image',
        alt: image.title || (Number.isFinite(ratio) ? '图片' : ratioOrAlt || '图片'),
        assetId,
        src: embeddedSrc,
        manualWidth: Number.isFinite(ratio) && (ratio < 0 || ratio > 10) ? Math.abs(ratio) : undefined,
      })
      continue
    }

    if (startsTable(lines, index)) {
      const headerCells = splitTableRow(line)
      const align = parseTableDelimiter(lines[index + 1] ?? '') ?? []
      const rows: WidgetInlineSegment[][][] = []
      index += 2
      while (index < lines.length) {
        const rowLine = lines[index] ?? ''
        if (!rowLine.trim() || !rowLine.includes('|')) break
        rows.push(splitTableRow(rowLine).map(parseInline))
        index += 1
      }
      index -= 1
      blocks.push({ type: 'table', header: headerCells.map(parseInline), rows, align })
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading?.[1] && heading[2]) {
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) })
      continue
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push({ type: 'divider' })
      continue
    }

    const bullet = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line)
    if (bullet?.[1]) {
      blocks.push({ type: 'bullet', inline: parseInline(bullet[1]) })
      continue
    }

    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line)
    if (ordered?.[1] && ordered[2]) {
      blocks.push({ type: 'ordered', order: Number(ordered[1]), inline: parseInline(ordered[2]) })
      continue
    }

    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      const quoteLines = [quote[1] ?? '']
      while (index + 1 < lines.length) {
        const nextQuote = /^\s*>\s?(.*)$/.exec(lines[index + 1] ?? '')
        if (!nextQuote) break
        index += 1
        quoteLines.push(nextQuote[1] ?? '')
      }
      const visibleQuoteLines = quoteLines.filter((quoteLine) => quoteLine.trim().length > 0)
      blocks.push({ type: 'quote', inline: parseInline(visibleQuoteLines.join('\n') || ' ') })
      continue
    }

    const paragraph = [line.trim()]
    while (index + 1 < lines.length && !isBlockStart(lines, index + 1)) {
      index += 1
      paragraph.push((lines[index] ?? '').trim())
    }
    blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) })
  }

  return blocks
}
