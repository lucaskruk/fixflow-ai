import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildKnowledgeProposalMutation,
  prepareKnowledgeProposalEvidence,
  selectDeliveredRepairsForKnowledgeProposal,
  selectKnowledgeDocumentsForProposal,
} from "../ai/knowledge-proposals";
import { useLocalComputeStatus } from "../ai/local-compute-coordinator";
import { localAIService, useLocalAIStatus } from "../ai/local-ai";
import { knowledgeApi } from "../api/knowledge";
import { repairsApi } from "../api/repairs";
import { AppShell } from "../components/AppShell";
import { KnowledgeProposalReview } from "../components/KnowledgeProposalReview";
import { LocalAIDebugPanel } from "../components/LocalAIDebugPanel";
import { LocalAIUnavailableNotice } from "../components/LocalAIUnavailableNotice";
import { StatePanel } from "../components/StatePanel";
import type {
  CreateKnowledgeDocumentInput,
  KnowledgeDocument,
  KnowledgeProposalCandidate,
  KnowledgeProposalRepairEvidence,
  KnowledgeDocumentStatus,
} from "../domain/schemas";

type EditorDraft = {
  id: string;
  title: string;
  tags: string;
  content: string;
  sources: string;
  status: KnowledgeDocumentStatus;
};

const emptyDraft: EditorDraft = {
  id: "",
  title: "",
  tags: "",
  content: "",
  sources: "",
  status: "draft",
};

function toDraft(document: KnowledgeDocument): EditorDraft {
  return {
    id: document.id,
    title: document.title,
    tags: document.tags.join(", "),
    content: document.content,
    sources: document.sources.join("\n"),
    status: document.status,
  };
}

function splitValues(value: string, separator: RegExp): string[] {
  return [...new Set(value.split(separator).map((item) => item.trim()).filter(Boolean))];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function Knowledge() {
  const aiStatus = useLocalAIStatus();
  const computeStatus = useLocalComputeStatus();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<"" | KnowledgeDocumentStatus>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalCandidates, setProposalCandidates] = useState<KnowledgeProposalCandidate[]>([]);
  const [proposalEvidence, setProposalEvidence] = useState<KnowledgeProposalRepairEvidence[]>([]);
  const aiBlocked = aiStatus.phase === "unsupported" || Boolean(aiStatus.failure?.blocksAI);

  useEffect(() => {
    void localAIService.probeCompatibility();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    knowledgeApi.list({}, controller.signal)
      .then(setDocuments)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "No pudimos cargar la documentación.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const allTags = useMemo(
    () => [...new Set(documents.flatMap((document) => document.tags))].sort(),
    [documents],
  );

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return documents.filter((document) => {
      if (tag && !document.tags.includes(tag)) return false;
      if (status && document.status !== status) return false;
      if (!normalizedQuery) return true;
      return normalize([
        document.id,
        document.title,
        document.content,
        ...document.tags,
        ...document.sources,
      ].join("\n")).includes(normalizedQuery);
    });
  }, [documents, query, status, tag]);

  function startCreate() {
    setSelectedId(null);
    setDraft(emptyDraft);
    setDeletePending(false);
    setFormError(null);
    setMessage(null);
  }

  function selectDocument(document: KnowledgeDocument) {
    setSelectedId(document.id);
    setDraft(toDraft(document));
    setDeletePending(false);
    setFormError(null);
    setMessage(null);
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setMessage(null);
    setDeletePending(false);

    const input: CreateKnowledgeDocumentInput = {
      id: draft.id,
      title: draft.title,
      tags: splitValues(draft.tags, /[,\n]/),
      content: draft.content,
      sources: splitValues(draft.sources, /\n/),
      status: draft.status,
    };

    try {
      if (selectedId) {
        const updated = await knowledgeApi.update(selectedId, {
          title: input.title,
          tags: input.tags,
          content: input.content,
          sources: input.sources,
          status: input.status,
        });
        setDocuments((current) =>
          current.map((document) => document.id === updated.id ? updated : document),
        );
        setDraft(toDraft(updated));
        setMessage("Documento actualizado.");
      } else {
        const created = await knowledgeApi.create(input);
        setDocuments((current) => [...current, created].sort((left, right) =>
          left.title.localeCompare(right.title),
        ));
        setSelectedId(created.id);
        setDraft(toDraft(created));
        setMessage("Documento creado como parte de la base técnica.");
      }
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "No pudimos guardar el documento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteDocument() {
    if (!selectedId) return;
    setDeleting(true);
    setFormError(null);
    setMessage(null);
    try {
      await knowledgeApi.delete(selectedId);
      setDocuments((current) => current.filter(({ id }) => id !== selectedId));
      setSelectedId(null);
      setDraft(emptyDraft);
      setDeletePending(false);
      setMessage(
        "Documento eliminado. Las sugerencias históricas conservan su ID de fuente.",
      );
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "No pudimos eliminar el documento.",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function proposeDocumentationUpdates() {
    if (proposalBusy) return;
    setProposalBusy(true);
    setProposalError(null);
    setMessage(null);
    setProposalCandidates([]);
    setProposalEvidence([]);
    try {
      const repairs = await repairsApi.list();
      const deliveredRepairs = selectDeliveredRepairsForKnowledgeProposal(repairs);
      if (deliveredRepairs.length === 0) {
        throw new Error("No hay reparaciones entregadas para revisar.");
      }
      const eventEntries = await Promise.all(deliveredRepairs.map(async (repair) => [
        repair.id,
        await repairsApi.listEvents(repair.id),
      ] as const));
      const evidence = prepareKnowledgeProposalEvidence(
        deliveredRepairs,
        Object.fromEntries(eventEntries),
      );
      if (evidence.length === 0) {
        throw new Error(
          "Las reparaciones entregadas no tienen diagnósticos ni reparaciones confirmados para respaldar una propuesta.",
        );
      }
      const relatedDocuments = selectKnowledgeDocumentsForProposal(documents, evidence);
      const candidates = await localAIService.generateKnowledgeProposals(
        evidence,
        relatedDocuments,
      );
      setProposalEvidence(evidence);
      setProposalCandidates(candidates);
      setMessage(candidates.length
        ? `${candidates.length} candidato${candidates.length === 1 ? "" : "s"} listo${candidates.length === 1 ? "" : "s"} para revisión. Todavía no se guardó nada.`
        : "No se encontraron actualizaciones documentales nuevas después de deduplicar.");
    } catch (reason) {
      setProposalError(
        localAIService.getSnapshot().failure
          ? null
          : reason instanceof Error
            ? reason.message
            : "No pudimos generar propuestas documentales.",
      );
    } finally {
      setProposalBusy(false);
    }
  }

  async function saveProposal(candidate: KnowledgeProposalCandidate) {
    const mutation = buildKnowledgeProposalMutation(candidate, documents, true);
    if (mutation.kind === "create") {
      const created = await knowledgeApi.create(mutation.input);
      setDocuments((current) => [...current, created].sort((left, right) =>
        left.title.localeCompare(right.title),
      ));
      setMessage(`Borrador ${created.id} creado después de la confirmación humana.`);
      return;
    }
    const updated = await knowledgeApi.update(mutation.id, mutation.input);
    setDocuments((current) => current.map((document) =>
      document.id === updated.id ? updated : document,
    ));
    setMessage(`Documento ${updated.id} actualizado después de la confirmación humana.`);
  }

  return (
    <AppShell>
      <main className="workspace knowledge-page">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Base técnica local</p>
            <h1>Knowledge</h1>
            <p>
              Administrá las fuentes que orientan el análisis. Sólo los documentos
              publicados participan del retrieval determinista.
            </p>
          </div>
          <div className="page-heading__actions">
            <button
              className="button button--ai"
              type="button"
              onClick={() => void proposeDocumentationUpdates()}
              disabled={
                proposalBusy ||
                computeStatus.activeTask === "speech-transcription" ||
                aiBlocked ||
                aiStatus.phase === "checking" ||
                aiStatus.phase === "loading" ||
                aiStatus.phase === "generating"
              }
            >
              <span aria-hidden="true">✦</span>
              {computeStatus.activeTask === "speech-transcription"
                ? "Esperando transcripción…"
                : proposalBusy || aiStatus.phase === "generating"
                ? "Preparando propuestas…"
                : "Proponer desde entregadas"}
            </button>
            <button className="button button--primary" type="button" onClick={startCreate}>
              Nuevo documento
            </button>
          </div>
        </header>

        <section className="knowledge-proposal-intro" aria-label="Actualización asistida de documentación">
          <p>
            Usa hasta 8 reparaciones <strong>entregadas</strong> y sólo diagnósticos o
            reparaciones confirmados. Las sugerencias de IA se excluyen de la evidencia.
          </p>
          <small>El modelo genera candidatos locales; la revisión y confirmación humana son obligatorias.</small>
        </section>

        {aiStatus.failure && <LocalAIUnavailableNotice failure={aiStatus.failure} />}
        {proposalError && <div className="notice notice--error" role="alert">{proposalError}</div>}
        {proposalError && aiStatus.debugOutput?.task === "knowledge-proposal" && (
          <LocalAIDebugPanel output={aiStatus.debugOutput} />
        )}
        {proposalCandidates.length > 0 && (
          <KnowledgeProposalReview
            candidates={proposalCandidates}
            documents={documents}
            allowedRepairIds={proposalEvidence.map(({ repairId }) => repairId)}
            onSave={saveProposal}
            onClose={() => {
              setProposalCandidates([]);
              setProposalEvidence([]);
            }}
          />
        )}

        <section className="knowledge-toolbar" aria-label="Filtros de documentación">
          <label className="search-field knowledge-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Buscar documentos</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, contenido, ID o fuente"
            />
          </label>
          <label className="field">
            <span>Tag</span>
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="">Todos</option>
              {allTags.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "" | KnowledgeDocumentStatus)}
            >
              <option value="">Todos</option>
              <option value="published">Publicados</option>
              <option value="draft">Borradores</option>
            </select>
          </label>
          <span className="knowledge-count" aria-live="polite">
            {filteredDocuments.length} de {documents.length}
          </span>
        </section>

        {message && <div className="notice notice--info" role="status">{message}</div>}

        {loading ? (
          <div className="panel skeleton knowledge-loading" aria-label="Cargando documentación" />
        ) : loadError ? (
          <StatePanel
            title="No pudimos cargar la documentación"
            tone="error"
            action={(
              <button className="button button--secondary" onClick={() => setReloadKey((key) => key + 1)}>
                Reintentar
              </button>
            )}
          >
            <p>{loadError}</p>
          </StatePanel>
        ) : (
          <div className="knowledge-layout">
            <section className="knowledge-list" aria-label="Documentos técnicos">
              {filteredDocuments.length ? filteredDocuments.map((document) => (
                <button
                  className={`knowledge-list-item${selectedId === document.id ? " knowledge-list-item--selected" : ""}`}
                  type="button"
                  key={document.id}
                  onClick={() => selectDocument(document)}
                >
                  <span className="knowledge-list-item__heading">
                    <strong>{document.title}</strong>
                    <span className={`knowledge-status knowledge-status--${document.status}`}>
                      {document.status === "published" ? "Publicado" : "Borrador"}
                    </span>
                  </span>
                  <code>{document.id}</code>
                  <span className="knowledge-tags">
                    {document.tags.slice(0, 4).map((value) => <span key={value}>{value}</span>)}
                  </span>
                </button>
              )) : (
                <div className="panel knowledge-empty">
                  <strong>Sin coincidencias</strong>
                  <p>Cambiá la búsqueda o los filtros para ver otros documentos.</p>
                </div>
              )}
            </section>

            <form className="panel knowledge-editor" onSubmit={saveDocument}>
              <div className="section-heading">
                <div>
                  <p className="section-kicker">{selectedId ? "Editar documento" : "Crear documento"}</p>
                  <h2>{selectedId ? draft.title : "Nueva fuente técnica"}</h2>
                </div>
              </div>

              <div className="form-grid">
                <label className="field field--full">
                  <span>ID estable <b>*</b></span>
                  <input
                    required
                    maxLength={100}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    value={draft.id}
                    disabled={Boolean(selectedId)}
                    onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                    placeholder="kb-tema-tecnico"
                  />
                  <small>Minúsculas, números y guiones. El ID no cambia después de crear.</small>
                </label>
                <label className="field field--full">
                  <span>Título <b>*</b></span>
                  <input
                    required
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Tags <b>*</b></span>
                  <input
                    required
                    value={draft.tags}
                    onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
                    placeholder="no-power, input-power"
                  />
                  <small>Separados por comas.</small>
                </label>
                <label className="field">
                  <span>Estado</span>
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      status: event.target.value as KnowledgeDocumentStatus,
                    }))}
                  >
                    <option value="draft">Borrador</option>
                    <option value="published">Publicado</option>
                  </select>
                  <small>Los borradores nunca se envían al modelo.</small>
                </label>
                <label className="field field--full">
                  <span>Contenido técnico <b>*</b></span>
                  <textarea
                    required
                    rows={10}
                    value={draft.content}
                    onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                  />
                </label>
                <label className="field field--full">
                  <span>Fuentes o referencias <b>*</b></span>
                  <textarea
                    required
                    rows={4}
                    value={draft.sources}
                    onChange={(event) => setDraft((current) => ({ ...current, sources: event.target.value }))}
                    placeholder="Una URL o referencia por línea"
                  />
                  <small>Una por línea. Esta procedencia queda guardada con el documento.</small>
                </label>
              </div>

              {formError && <div className="notice notice--error" role="alert">{formError}</div>}

              <div className="knowledge-editor__actions">
                <button className="button button--primary" type="submit" disabled={saving}>
                  {saving ? "Guardando…" : selectedId ? "Guardar cambios" : "Crear documento"}
                </button>
                {selectedId && !deletePending && (
                  <button className="button button--danger" type="button" onClick={() => setDeletePending(true)}>
                    Eliminar
                  </button>
                )}
              </div>

              {selectedId && deletePending && (
                <div className="knowledge-delete-confirmation" role="alert">
                  <strong>¿Eliminar “{draft.title}”?</strong>
                  <p>
                    Dejará de estar disponible para nuevos análisis. Los análisis históricos
                    conservarán el ID citado, aunque ya no se pueda abrir el documento.
                  </p>
                  <div>
                    <button className="button button--danger" type="button" disabled={deleting} onClick={() => void deleteDocument()}>
                      {deleting ? "Eliminando…" : "Sí, eliminar"}
                    </button>
                    <button className="button button--secondary" type="button" disabled={deleting} onClick={() => setDeletePending(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}
      </main>
    </AppShell>
  );
}
