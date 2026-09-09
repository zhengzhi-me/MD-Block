import { create } from 'zustand'

interface EditorState {
  /** 文档标题（非 Markdown 内容），用于导出文件名 */
  title: string
  /** 当前 Markdown 源码快照，由编辑器内容变化时同步 */
  markdown: string
  setTitle: (title: string) => void
  setMarkdown: (markdown: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  title: '',
  markdown: '',
  setTitle: (title) => set({ title }),
  setMarkdown: (markdown) => set({ markdown }),
}))
