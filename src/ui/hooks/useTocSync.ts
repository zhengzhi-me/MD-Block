import { useEffect, type RefObject } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { useTocStore } from '../stores/tocStore'

interface UseTocSyncOptions {
  rootRef: RefObject<HTMLDivElement | null>
  crepeRef: RefObject<Crepe | null>
  ready: boolean
}

/**
 * 监听编辑器滚动，同步当前高亮的标题到 tocStore。
 * 使用 capture 方式监听，可捕获 Crepe 内部滚动容器的 scroll 事件。
 */
export function useTocSync({ rootRef, crepeRef, ready }: UseTocSyncOptions) {
  const setActiveId = useTocStore((s) => s.setActiveId)

  useEffect(() => {
    if (!ready) return
    const root = rootRef.current
    if (!root) return

    const handleScroll = () => {
      const crepe = crepeRef.current
      if (!crepe) return

      const headings = useTocStore.getState().headings
      const rootTop = root.getBoundingClientRect().top
      let activeId: string | null = null

      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        for (const heading of headings) {
          const node = view.nodeDOM(heading.pos)
          const el = node instanceof HTMLElement ? node : node?.parentElement
          if (!el) continue

          if (el.getBoundingClientRect().top <= rootTop + 8) {
            activeId = heading.id
          } else {
            break
          }
        }
      })

      setActiveId(activeId)
    }

    handleScroll()

    root.addEventListener('scroll', handleScroll, { passive: true, capture: true })
    return () => {
      root.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [ready, rootRef, crepeRef, setActiveId])
}
