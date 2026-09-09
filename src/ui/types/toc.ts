/** 平铺的标题节点（按文档顺序） */
export interface FlatHeading {
  /** 稳定标识，用于 React key 与高亮匹配 */
  id: string
  /** 标题层级 1-6 */
  level: number
  /** 标题文本 */
  text: string
  /** 在 ProseMirror 文档中的位置，用于定位 */
  pos: number
}

/** 目录树节点（无限层级） */
export interface TocNode extends FlatHeading {
  children: TocNode[]
}
