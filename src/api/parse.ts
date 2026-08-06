/** Discovery Engine のレスポンスを UI 用の形に整形する。 */
import type {
  AnswerOutcome,
  AnswerReference,
  SearchHit,
  SearchOutcome,
} from './types'

export const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

export const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(asRecord) : []

export const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function parseSearchResponse(raw: Record<string, unknown>): SearchOutcome {
  const hits: SearchHit[] = asArray(raw.results).map((result) => {
    const doc = asRecord(result.document)
    const derived = asRecord(doc.derivedStructData)
    const struct = asRecord(doc.structData)
    const content = asRecord(doc.content)

    const title =
      asString(derived.title) ||
      asString(struct.title) ||
      asString(doc.id) ||
      asString(doc.name).split('/').pop() ||
      '(タイトルなし)'

    return {
      id: asString(result.id) || asString(doc.id),
      title,
      link: asString(derived.link) || asString(content.uri) || asString(struct.link),
      mimeType: asString(content.mimeType) || asString(derived.mime_type) || undefined,
      snippets: asArray(derived.snippets).map((s) => asString(s.snippet)).filter(Boolean),
      extractiveAnswers: asArray(derived.extractive_answers)
        .map((a) => asString(a.content))
        .filter(Boolean),
      documentName: asString(doc.name),
      raw: result,
    }
  })

  const summary = asRecord(raw.summary)

  return {
    hits,
    summaryText: asString(summary.summaryText),
    totalSize: Number(raw.totalSize ?? hits.length) || 0,
    correctedQuery: asString(raw.correctedQuery) || undefined,
    nextPageToken: asString(raw.nextPageToken) || undefined,
    raw,
  }
}

export function parseAnswerResponse(raw: Record<string, unknown>): AnswerOutcome {
  const answer = asRecord(raw.answer)

  const references: AnswerReference[] = asArray(answer.references).map((ref) => {
    const unstructured = asRecord(ref.unstructuredDocumentInfo)
    const chunk = asRecord(ref.chunkInfo)
    const chunkDoc = asRecord(chunk.documentMetadata)

    if (Object.keys(unstructured).length > 0) {
      const chunkContents = asArray(unstructured.chunkContents)
        .map((c) => asString(c.content))
        .filter(Boolean)
      return {
        title: asString(unstructured.title) || asString(unstructured.uri) || '(タイトルなし)',
        uri: asString(unstructured.uri),
        documentName: asString(unstructured.document),
        content: chunkContents.join('\n\n'),
      }
    }

    return {
      title: asString(chunkDoc.title) || asString(chunkDoc.uri) || '(タイトルなし)',
      uri: asString(chunkDoc.uri),
      documentName: asString(chunkDoc.document) || asString(chunk.chunk),
      content: asString(chunk.content),
    }
  })

  const relatedQuestions = Array.isArray(answer.relatedQuestions)
    ? (answer.relatedQuestions as unknown[]).map(asString).filter(Boolean)
    : []

  return {
    answerText: asString(answer.answerText),
    state: asString(answer.state) || 'UNKNOWN',
    references,
    relatedQuestions,
    sessionName: asString(asRecord(raw.session).name) || undefined,
    raw,
  }
}
