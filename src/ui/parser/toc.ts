import type { Ctx } from '@milkdown/kit/ctx'
import { editorViewCtx } from '@milkdown/kit/core'
import type { FlatHeading, TocNode } from '../types/toc'

/** 从 ProseMirror 文档提取标题（平铺，按文档顺序） */
export function extractHeadings(ctx: Ctx): FlatHeading[] {
  const view = ctx.get(editorViewCtx)
  const { doc } = view.state
  const headings: FlatHeading[] = []
  let index = 0

  doc.forEach((node, pos) => {
    if (node.type.name !== 'heading') return

    const level = node.attrs.level
    if (typeof level !== 'number' || level < 1 || level > 6) return

    headings.push({
      id: `h-${index}`,
      level,
      text: node.textContent,
      pos,
    })
    index += 1
  })

  return headings
}

/** 将平铺标题列表构建为目录树（无限层级） */
export function buildTree(headings: FlatHeading[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []

  for (const heading of headings) {
    const node: TocNode = { ...heading, children: [] }

    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (!top || top.level < node.level) break
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    stack.push(node)
  }

  return roots
}
