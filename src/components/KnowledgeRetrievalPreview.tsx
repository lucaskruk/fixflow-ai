import type { KnowledgeDocument } from "../domain/schemas";

export const knowledgeRetrievalPreviewLimit = 3;

export function getKnowledgeRetrievalPreviewDocuments(
  documents: readonly KnowledgeDocument[],
): KnowledgeDocument[] {
  return documents
    .filter((document) => document.status === "published")
    .slice(0, knowledgeRetrievalPreviewLimit);
}

function DocumentIdentity({ document }: { document: KnowledgeDocument }) {
  const firstSource = document.sources[0];
  const extraSourceCount = Math.max(0, document.sources.length - 1);

  return (
    <>
      <div className="retrieval-document__heading">
        <strong>{document.title}</strong>
        <code>{document.id}</code>
      </div>
      <div className="retrieval-document__tags" aria-label={`Etiquetas de ${document.title}`}>
        {document.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <p className="retrieval-document__source">
        <strong>Procedencia:</strong>{" "}
        {firstSource}
        {extraSourceCount > 0 && ` · +${extraSourceCount} fuente${extraSourceCount === 1 ? "" : "s"}`}
      </p>
    </>
  );
}

type KnowledgeRetrievalPreviewProps = {
  documents: readonly KnowledgeDocument[];
  onRefresh: () => void;
  refreshing: boolean;
  error: string | null;
  message: string | null;
};

export function KnowledgeRetrievalPreview({
  documents,
  onRefresh,
  refreshing,
  error,
  message,
}: KnowledgeRetrievalPreviewProps) {
  const previewDocuments = getKnowledgeRetrievalPreviewDocuments(documents);

  return (
    <section
      className="knowledge-retrieval-preview"
      aria-labelledby="knowledge-retrieval-preview-title"
      aria-busy={refreshing}
      data-knowledge-relation="retrieved"
    >
      <div className="knowledge-retrieval-preview__heading">
        <div>
          <span>Retrieval determinista</span>
          <h3 id="knowledge-retrieval-preview-title">Documentos recuperados para el análisis</h3>
        </div>
        <button
          className="text-button knowledge-retrieval-preview__refresh"
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Actualizando…" : "Actualizar selección"}
        </button>
      </div>
      <p className="knowledge-retrieval-preview__intro">
        Se seleccionan antes de ejecutar la IA a partir de la ficha y del historial técnico guardado.
      </p>
      {previewDocuments.length > 0 ? (
        <ol className="knowledge-retrieval-preview__list">
          {previewDocuments.map((document) => (
            <li key={document.id}>
              <DocumentIdentity document={document} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="knowledge-retrieval-preview__empty">
          No hay documentos publicados que coincidan con la evidencia actual.
        </p>
      )}
      <p className="knowledge-retrieval-preview__distinction">
        Recuperado no significa citado: las fuentes que el modelo finalmente cite aparecerán dentro de la sugerencia guardada.
      </p>
      <span className="knowledge-retrieval-preview__feedback" aria-live="polite">
        {message}
      </span>
      {error && <p className="knowledge-retrieval-preview__error" role="alert">{error}</p>}
    </section>
  );
}

export function KnowledgeCitationList({
  sourceIds,
  documents,
}: {
  sourceIds: readonly string[];
  documents: readonly KnowledgeDocument[];
}) {
  return (
    <section
      className="diagnostic-analysis__sources"
      aria-label="Fuentes citadas en la sugerencia de IA"
      data-knowledge-relation="cited"
    >
      <h3>Fuentes citadas por el modelo</h3>
      {sourceIds.length > 0 ? (
        <ul>
          {sourceIds.map((sourceId) => (
            <li key={sourceId}>
              <span>{documents.find(({ id }) => id === sourceId)?.title ?? sourceId}</span>
              <code>{sourceId}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>El modelo no citó documentos de la base local en esta sugerencia.</p>
      )}
    </section>
  );
}
