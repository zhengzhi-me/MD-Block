import type { WidgetImageAsset } from '../../shared/messages'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'

/** 输出为标准 GFM；仅把独占一行的 HTML br 当作空白行，避免拆坏表格单元格。 */
export function normalizeMarkdownForExport(markdown: string): string {
  const standaloneBreaksNormalized = markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (/^\s*<br\s*\/?\s*>\s*$/i.test(line) ? '' : line))
    .join('\n')

  try {
    const serialized = String(
      unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkStringify, {
          bullet: '-',
          fences: true,
          listItemIndent: 'one',
        })
        .processSync(standaloneBreaksNormalized),
    )
    // 部分 Markdown 编辑器只接受至少 3 个连字符的表头分隔行。
    return serialized
      .split('\n')
      .map((line) => {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
        if (cells.length < 2 || cells.some((cell) => !/^:?-+:?$/.test(cell))) return line
        return line.replace(/(:?)-+(:?)/g, (_match, left: string, right: string) => `${left}---${right}`)
      })
      .join('\n')
  } catch {
    return `${standaloneBreaksNormalized.trimEnd()}\n`
  }
}

/** 清理文件名中的非法字符 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || '未命名'
}

/** 触发文本文件下载 */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(filename, blob)
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('无效的图片数据')
  const header = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (!header.includes(';base64')) return new TextEncoder().encode(decodeURIComponent(payload))

  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0)
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true)
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, true)
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

/** 生成无压缩 ZIP，避免为仅打包附件引入额外运行时依赖。 */
function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const checksum = crc32(entry.data)
    const local = new Uint8Array(30 + name.length + entry.data.length)
    writeUint32(local, 0, 0x04034b50)
    writeUint16(local, 4, 20)
    writeUint16(local, 6, 0x0800)
    writeUint16(local, 8, 0)
    writeUint32(local, 14, checksum)
    writeUint32(local, 18, entry.data.length)
    writeUint32(local, 22, entry.data.length)
    writeUint16(local, 26, name.length)
    local.set(name, 30)
    local.set(entry.data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    writeUint32(central, 0, 0x02014b50)
    writeUint16(central, 4, 20)
    writeUint16(central, 6, 20)
    writeUint16(central, 8, 0x0800)
    writeUint16(central, 10, 0)
    writeUint32(central, 16, checksum)
    writeUint32(central, 20, entry.data.length)
    writeUint32(central, 24, entry.data.length)
    writeUint16(central, 28, name.length)
    writeUint32(central, 42, localOffset)
    central.set(name, 46)
    centrals.push(central)
    localOffset += local.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  writeUint32(end, 0, 0x06054b50)
  writeUint16(end, 8, entries.length)
  writeUint16(end, 10, entries.length)
  writeUint32(end, 12, centralSize)
  writeUint32(end, 16, localOffset)

  const total = localOffset + centralSize + end.length
  const zip = new Uint8Array(total)
  let offset = 0
  for (const part of [...locals, ...centrals, end]) {
    zip.set(part, offset)
    offset += part.length
  }
  return zip
}

function extensionFor(asset: WidgetImageAsset): string {
  const fromName = /\.([a-zA-Z0-9]{2,5})$/.exec(asset.name)?.[1]
  if (fromName) return fromName.toLowerCase()
  const fromMime = asset.mimeType.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg')
  return fromMime || 'png'
}

function assetFilename(asset: WidgetImageAsset, index: number): string {
  const extension = extensionFor(asset)
  const base = sanitizeFilename(asset.name.replace(/\.[^.]+$/, '')) || `image-${index + 1}`
  return `${base}-${index + 1}.${extension}`
}

export function embedAssetsInMarkdown(markdown: string, assets: WidgetImageAsset[]): string {
  return assets.reduce(
    (result, asset) => result.split(`figma-asset://${asset.id}`).join(asset.dataUrl),
    markdown,
  )
}

/**
 * 无附件时下载单个 .md；有附件时下载包含 Markdown 与 assets 文件夹的 ZIP。
 */
export function downloadMarkdownPackage(
  title: string,
  markdown: string,
  assets: WidgetImageAsset[],
): 'markdown' | 'zip' {
  const safeTitle = sanitizeFilename(title)
  const referenced = assets.filter((asset) => markdown.includes(`figma-asset://${asset.id}`))
  if (referenced.length === 0) {
    downloadText(`${safeTitle}.md`, markdown)
    return 'markdown'
  }

  let packagedMarkdown = markdown
  const entries: ZipEntry[] = []
  referenced.forEach((asset, index) => {
    const filename = assetFilename(asset, index)
    packagedMarkdown = packagedMarkdown
      .split(`figma-asset://${asset.id}`)
      .join(`assets/${filename}`)
    entries.push({ name: `assets/${filename}`, data: dataUrlToBytes(asset.dataUrl) })
  })
  entries.unshift({ name: `${safeTitle}.md`, data: new TextEncoder().encode(packagedMarkdown) })
  const zipBytes = createZip(entries)
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  downloadBlob(`${safeTitle}.zip`, new Blob([zipBuffer], { type: 'application/zip' }))
  return 'zip'
}
