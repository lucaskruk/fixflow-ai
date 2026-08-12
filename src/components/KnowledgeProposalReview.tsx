import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  classifyKnowledgeProposal,
} from "../ai/knowledge-proposals";
import type {
  KnowledgeDocument,
  KnowledgeProposalCandidate,
} from "../domain/schemas";

type Props = {
  candidates: readonly KnowledgeProposalCandidate[];
  documents: readonly KnowledgeDocument[];
  allowedRepairIds: readonly string[];
  onSave: (candidate: KnowledgeProposalCandidate) => Promise<void>;
  onClose: () => void;
};

function ProposalCard({
  candidate,
  documents,
  allowedRepairIds,
  onSave,
}: Omit<Props, "candidates" | "onClose"> & { candidate: KnowledgeProposalCandidate }) {
  const [draft, setDraft] = useState(candidate);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(candidate);
    setConfirmed(false);
    setSaved(false);
    setError(null);
  }, [candidate]);

  const classification = classifyKnowledgeProposal(draft, documents);
  const target = classification.kind === "update" || classification.kind === "duplicate"
    ? classification.document
    : null;

  function edit(change: Partial<KnowledgeProposalCandidate>) {
    setDraft((current) => ({ ...current, ...change }));
    setConfirmed(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar la propuesta.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <article className="knowledge-proposal-card">
        <div className="notice notice--info" role="status">
          Propuesta guardada después de la revisión humana.
        </div>
      </article>
    );
  }

  return (
    <article className="knowledge-proposal-card">
      <div className="knowledge-proposal-card__heading">
        <div>
          <p className="section-kicker">Revisión obligatoria</p>
          <h3>{target ? "Actualización propuesta" : "Documento nuevo propuesto"}</h3>
        </div>
        <span className={`knowledge-proposal-kind knowledge-proposal-kind--${target ? "update" : "new"}`}>
          {target ? `Actualizar ${target.id}` : "Nuevo borrador"}
        </span>
      </div>

      <div className="form-grid">
        <label className="field field--full">
          <span>Tipo y destino</span>
          <select
            value={draft.targetDocumentId ?? ""}
            onChange={(event) => {
              const targetId = event.target.value || null;
              edit(targetId
                ? { operation: "update", targetDocumentId: targetId, id: targetId }
                : { operation: "new", targetDocumentId: null });
            }}
          >
            <option value="">Crear documento nuevo</option>
            {documents.map((document) => (
              <option value={document.id} key={document.id}>
                Actualizar: {document.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--full">
          <span>ID estable</span>
          <input
            required
            maxLength={100}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={draft.id}
            disabled={Boolean(draft.targetDocumentId)}
            onChange={(event) => edit({ id: event.target.value })}
          />
        </label>
        <label className="field field--full">
          <span>Título</span>
          <input
            required
            maxLength={180}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
          />
        </label>
        <label className="field field--full">
          <span>Tags</span>
          <input
            required
            value={draft.tags.join(", ")}
            onChange={(event) => edit({
              tags: [...new Set(event.target.value.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean))],
            })}
          />
          <small>Editables y separados por comas.</small>
        </label>
        <label className="field field--full">
          <span>Contenido técnico propuesto</span>
          <textarea
            required
            rows={12}
            value={draft.content}
            onChange={(event) => edit({ content: event.target.value })}
          />
        </label>
      </div>

      <fieldset className="knowledge-proposal-sources">
        <legend>Reparaciones de procedencia</legend>
        <p>Sólo casos entregados con diagnóstico o reparación confirmados.</p>
        <div>
          {allowedRepairIds.map((repairId) => (
            <label key={repairId}>
              <input
                type="checkbox"
                checked={draft.sourceRepairIds.includes(repairId)}
                onChange={(event) => edit({
                  sourceRepairIds: event.target.checked
                    ? [...new Set([...draft.sourceRepairIds, repairId])]
                    : draft.sourceRepairIds.filter((id) => id !== repairId),
                })}
              />
              <Link to={`/repairs/${encodeURIComponent(repairId)}`}>{repairId}</Link>
            </label>
          ))}
        </div>
      </fieldset>

      {target && (
        <section className="knowledge-proposal-diff" aria-label="Diferencias respecto del documento actual">
          <h4>Diferencias respecto del documento actual</h4>
          <div>
            <article>
              <strong>Contenido actual</strong>
              <p>{target.content}</p>
              <small>Tags: {target.tags.join(", ")}</small>
            </article>
            <article>
              <strong>Contenido propuesto</strong>
              <p>{draft.content}</p>
              <small>Tags: {draft.tags.join(", ")}</small>
            </article>
          </div>
        </section>
      )}

      {classification.kind === "duplicate" && (
        <div className="notice notice--caution" role="status">
          Esta versión coincide con <code>{classification.document.id}</code>. Editá el contenido o descartala.
        </div>
      )}
      {error && <div className="notice notice--error" role="alert">{error}</div>}

      <label className="knowledge-proposal-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          Revisé el contenido, los tags, las diferencias y las reparaciones citadas.
          Confirmo este guardado humano.
        </span>
      </label>
      <button
        className="button button--primary"
        type="button"
        disabled={
          saving ||
          !confirmed ||
          classification.kind === "duplicate" ||
          draft.sourceRepairIds.length === 0
        }
        onClick={() => void save()}
      >
        {saving
          ? "Guardando…"
          : target
            ? "Confirmar y actualizar"
            : "Confirmar y crear borrador"}
      </button>
    </article>
  );
}

export function KnowledgeProposalReview({
  candidates,
  documents,
  allowedRepairIds,
  onSave,
  onClose,
}: Props) {
  return (
    <section className="panel knowledge-proposal-review" aria-labelledby="knowledge-proposal-heading">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Candidatos sin publicar</p>
          <h2 id="knowledge-proposal-heading">Revisar propuestas documentales</h2>
          <p>
            El modelo sólo preparó candidatos. Ningún cambio se guarda hasta confirmar
            cada propuesta y los documentos nuevos siempre nacen como borradores.
          </p>
        </div>
        <button className="button button--secondary" type="button" onClick={onClose}>
          Cerrar revisión
        </button>
      </div>
      <div className="knowledge-proposal-list">
        {candidates.map((candidate, index) => (
          <ProposalCard
            key={`${candidate.id}-${index}`}
            candidate={candidate}
            documents={documents}
            allowedRepairIds={allowedRepairIds}
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  );
}
