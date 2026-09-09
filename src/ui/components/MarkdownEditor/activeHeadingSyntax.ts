import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/utils'

/**
 * 光标进入标题行时显示 Markdown 标记，离开后恢复纯渲染视图。
 * 标记由 Decoration 提供，不写入文档，因此不会污染撤销栈或重复保存。
 */
export const activeHeadingSyntax = $prose(
  () =>
    new Plugin({
      key: new PluginKey('MD_BLOCK_ACTIVE_HEADING_SYNTAX'),
      props: {
        decorations(state) {
          const { $from } = state.selection
          const heading = $from.parent
          const level = heading.type.name === 'heading' ? heading.attrs.level : null
          if (typeof level !== 'number' || level < 1 || level > 6 || $from.depth < 1) {
            return DecorationSet.empty
          }

          const start = $from.before($from.depth)
          const decoration = Decoration.node(start, start + heading.nodeSize, {
            class: 'md-active-heading',
            'data-md-marker': `${'#'.repeat(level)} `,
          })
          return DecorationSet.create(state.doc, [decoration])
        },
      },
    }),
)
