/** Markdown 编辑器对外暴露的操作接口 */
export interface MarkdownEditorHandle {
  /** 读取当前 Markdown 源码 */
  getMarkdown: () => string
  /** 从外部设置 Markdown 源码（用于恢复编辑等场景） */
  setMarkdown: (markdown: string) => void
  /** 滚动到指定位置的标题 */
  scrollToHeading: (pos: number) => void
  /** 在当前光标位置插入可跳转的 Figma 画板或图层链接 */
  insertFrameLink: (name: string, nodeId: string, url: string) => void
  /** 将外部 Markdown 内容追加到文档最后。 */
  appendMarkdown: (markdown: string) => void
}
