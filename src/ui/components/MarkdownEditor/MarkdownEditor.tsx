import { forwardRef, useImperativeHandle } from 'react'
import type { MarkdownEditorHandle } from '../../types/editor'
import { useTocStore } from '../../stores/tocStore'
import { useCrepe } from './useCrepe'
import { useTocSync } from '../../hooks/useTocSync'

interface MarkdownEditorProps {
  /** 编辑器初始 Markdown 内容 */
  defaultValue?: string
  /** 是否只读（预览模式） */
  readonly?: boolean
  /** 内容变化时回调 */
  onChange?: (markdown: string) => void
  /** 图片上传后返回稳定资源 URI */
  onUploadImage?: (file: File) => Promise<string>
  /** 解析编辑器中的图片资源 URI */
  resolveImageUrl?: (url: string) => Promise<string> | string
  /** 点击 Figma 画板链接 */
  onNavigateNode?: (nodeId: string) => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      defaultValue = '',
      readonly = false,
      onChange,
      onUploadImage,
      resolveImageUrl,
      onNavigateNode,
    },
    ref,
  ) {
    const setHeadings = useTocStore((s) => s.setHeadings)

    const {
      rootRef,
      crepeRef,
      ready,
      getMarkdown,
      setMarkdown,
      scrollToHeading,
      insertFrameLink,
      appendMarkdown,
    } = useCrepe({
      defaultValue,
      readonly,
      onChange,
      onHeadingsChange: setHeadings,
      onUploadImage,
      resolveImageUrl,
      onNavigateNode,
    })

    useTocSync({ rootRef, crepeRef, ready })

    useImperativeHandle(
      ref,
      () => ({ getMarkdown, setMarkdown, scrollToHeading, insertFrameLink, appendMarkdown }),
      [getMarkdown, setMarkdown, scrollToHeading, insertFrameLink, appendMarkdown],
    )

    return <div ref={rootRef} className="markdown-editor-shell h-full w-full overflow-y-auto" />
  },
)
