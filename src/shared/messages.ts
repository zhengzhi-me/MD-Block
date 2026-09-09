/** 保存在 Widget syncedState 中的图片附件 */
export interface WidgetImageAsset {
  id: string
  name: string
  mimeType: string
  dataUrl: string
  width: number
  height: number
}

/** Widget 文档数据（通过 syncedState 多人同步） */
export interface WidgetDocData {
  title: string
  markdown: string
  assets: WidgetImageAsset[]
  /** 当前文件 Key 的 UI 快照及旧版逐 Widget 数据兼容字段 */
  figmaFileKey?: string
}

export type ResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/** UI → 主线程（Widget）的消息 */
export type PluginMessage =
  | { type: 'ready' }
  | { type: 'ui-heartbeat' }
  | { type: 'ui-closing' }
  | { type: 'save'; data: WidgetDocData }
  | { type: 'resize-start'; direction: ResizeDirection }
  | { type: 'resize'; width: number; height: number; offsetX: number; offsetY: number }
  | { type: 'resize-end' }
  | { type: 'notify'; message: string }
  | { type: 'insert-selected-frame' }
  | { type: 'set-figma-file-url'; url: string; insertSelected: boolean }
  | { type: 'navigate-node'; nodeId: string }

/** 主线程（Widget）→ UI 的消息 */
export type UIMessage =
  | { type: 'init'; data: WidgetDocData; canEdit: boolean }
  | { type: 'saved' }
  | { type: 'frame-link-ready'; nodeId: string; name: string; url: string }
  | { type: 'file-link-required' }
  | { type: 'file-link-configured'; fileKey: string }
  | { type: 'error'; message: string }
