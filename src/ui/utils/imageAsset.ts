import type { WidgetImageAsset } from '../../shared/messages'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

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

export async function fileToImageAsset(file: File): Promise<WidgetImageAsset> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 4 MB')

  const dataUrl = await readAsDataUrl(file)
  const { width, height } = await readImageSize(dataUrl)
  return {
    id: createAssetId(),
    name: file.name || 'image',
    mimeType: file.type || 'image/png',
    dataUrl,
    width,
    height,
  }
}

export function imageAssetUri(id: string): string {
  return `figma-asset://${id}`
}
