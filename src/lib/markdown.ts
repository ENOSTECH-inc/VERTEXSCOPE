import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * 生成回答・要約・スニペットはインデックス済みドキュメント由来の文字列なので、
 * Markdown を HTML 化したあと必ずサニタイズしてから DOM に流し込む。
 */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text ?? '', { breaks: true, gfm: true, async: false })
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  })
}

/** 検索スニペットの `<b>` などを落として素のテキストにする。 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
}
