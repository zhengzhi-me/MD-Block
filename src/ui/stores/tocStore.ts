import { create } from 'zustand'
import type { FlatHeading } from '../types/toc'

interface TocState {
  /** 平铺标题列表（按文档顺序） */
  headings: FlatHeading[]
  /** 当前高亮的标题 id */
  activeId: string | null
  setHeadings: (headings: FlatHeading[]) => void
  setActiveId: (id: string | null) => void
}

export const useTocStore = create<TocState>((set) => ({
  headings: [],
  activeId: null,
  setHeadings: (headings) => set({ headings }),
  setActiveId: (activeId) => set({ activeId }),
}))
