import type { WidgetImageAsset } from '../../shared/messages'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_FIGMA_IMAGE_DIMENSION = 4096
const FIGMA_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img')
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('无法识别图片尺寸'))
    image.src = dataUrl
  })
}

function createAssetId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function rasterizeImage(
  dataUrl: string,
  width: number,
  height: number,
  mimeType: string,
): Promise<{ dataUrl: string; width: number; height: number; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img')
    image.onload = () => {
      const scale = Math.min(1, MAX_FIGMA_IMAGE_DIMENSION / width, MAX_FIGMA_IMAGE_DIMENSION / height)
      const nextWidth = Math.max(1, Math.round(width * scale))
      const nextHeight = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = nextWidth
      canvas.height = nextHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('无法转换图片格式'))
        return
      }
      context.drawImage(image, 0, 0, nextWidth, nextHeight)
      const outputMimeType = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      resolve({
        dataUrl: canvas.toDataURL(outputMimeType, 0.9),
        width: nextWidth,
        height: nextHeight,
        mimeType: outputMimeType,
      })
    }
    image.onerror = () => reject(new Error('无法转换该图片，请使用 PNG、JPEG 或 GIF'))
    image.src = dataUrl
  })
}

/** 将旧资源或浏览器支持的图片格式规范化为 Figma 画布可稳定显示的资源。 */
export async function normalizeImageAsset(asset: WidgetImageAsset): Promise<WidgetImageAsset> {
  const measured = await readImageSize(asset.dataUrl)
  const mimeType = asset.mimeType.toLowerCase()
  const needsRasterizing = !FIGMA_IMAGE_TYPES.has(mimeType) ||
    measured.width > MAX_FIGMA_IMAGE_DIMENSION ||
    measured.height > MAX_FIGMA_IMAGE_DIMENSION

  if (!needsRasterizing) {
    if (asset.width === measured.width && asset.height === measured.height) return asset
    return { ...asset, width: measured.width, height: measured.height }
  }

  const normalized = await rasterizeImage(
    asset.dataUrl,
    measured.width,
    measured.height,
    mimeType,
  )
  return { ...asset, ...normalized }
}

export async function fileToImageAsset(file: File): Promise<WidgetImageAsset> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 4 MB')

  const dataUrl = await readAsDataUrl(file)
  const { width, height } = await readImageSize(dataUrl)
  return normalizeImageAsset({
    id: createAssetId(),
    name: file.name || 'image',
    mimeType: file.type || 'image/png',
    dataUrl,
    width,
    height,
  })
}

export function imageAssetUri(id: string): string {
  return `figma-asset://${id}`
}
