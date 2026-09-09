import type { WidgetDocData } from '../../shared/messages'
import { sendToPlugin } from './pluginBridge'

/** 保存文档（写回 Widget 的 syncedState） */
export function saveDocument(data: WidgetDocData): void {
  sendToPlugin({ type: 'save', data })
}

/** 通过主线程弹出 Figma 原生通知 */
export function notify(message: string): void {
  sendToPlugin({ type: 'notify', message })
}
