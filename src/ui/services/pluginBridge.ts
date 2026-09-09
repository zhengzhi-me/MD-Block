import type { PluginMessage, UIMessage } from '../../shared/messages'

/** 发送消息到 Figma 主线程 */
export function sendToPlugin(message: PluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*')
}

/** 监听 Figma 主线程消息，返回取消监听的函数 */
export function onPluginMessage(handler: (message: UIMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data = event.data as { pluginMessage?: UIMessage } | null
    const message = data?.pluginMessage
    if (message) handler(message)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
