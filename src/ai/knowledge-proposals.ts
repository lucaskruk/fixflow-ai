import {
  knowledgeProposalCandidateSchema,
  type CreateKnowledgeDocumentInput,
  type KnowledgeDocument,
  type KnowledgeProposalCandidate,
  type KnowledgeProposalRepairEvidence,
  type Repair,
  type RepairEvent,
  type UpdateKnowledgeDocumentInput,
} from "../domain/schemas";
import { identifyKnowledgeTags } from "./knowledge-base";

export const MAX_PROPOSAL_REPAIRS = 8;
export const MAX_PROPOSAL_EVENTS_PER_TYPE = 8;
export const MAX_PROPOSAL_DOCUMENTS = 8;
const MAX_EVIDENCE_TEXT_LENGTH = 1_000;

export type KnowledgeProposalMutation =
  | {
      kind: "create";
      id: string;
      input: CreateKnowledgeDocumentInput;
    }
  | {
      kind: "update";
      id: string;
      input: UpdateKnowledgeDocumentInput;
    };

export type KnowledgeProposalClassification =
  | { kind: "new" }
  | { kind: "update"; document: KnowledgeDocument }
  | { kind: "duplicate"; document: KnowledgeDocument };

function limitText(value: string): string {
  return value.trim().slice(0, MAX_EVIDENCE_TEXT_LENGTH);
}

function uniqueLimited(values: readonly string[]): string[] {
  return [...new Set(values.map(limitText).filter(Boolean))]
    .slice(0, MAX_PROPOSAL_EVENTS_PER_TYPE);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(normalizeText).filter(Boolean))].sort();
}

function normalizeDocumentId(value: unknown, fallback: unknown): string {
  const slugify = (input: unknown) => typeof input === "string"
    ? input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100)
        .replace(/-+$/g, "")
    : "";

  return slugify(value) || slugify(fallback);
}

function uniqueDocumentId(
  preferredId: string,
  unavailableIds: ReadonlySet<string>,
): string {
  if (!unavailableIds.has(preferredId)) return preferredId;

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${preferredId.slice(0, 100 - ending.length).replace(/-+$/g, "")}${ending}`;
    if (!unavailableIds.has(candidate)) return candidate;
  }
  return "";
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return normalizeTags(left).join("\n") === normalizeTags(right).join("\n");
}

function isConfirmedEvidence(evidence: KnowledgeProposalRepairEvidence): boolean {
  return Boolean(
    evidence.confirmedRepairDiagnosis ||
    evidence.confirmedRepairSolution ||
    evidence.confirmedDiagnosisEvents.length ||
    evidence.confirmedRepairEvents.length
  );
}

export function selectDeliveredRepairsForKnowledgeProposal(
  repairs: readonly Repair[],
  limit = MAX_PROPOSAL_REPAIRS,
): Repair[] {
  const safeLimit = Math.max(0, Math.min(MAX_PROPOSAL_REPAIRS, Math.floor(limit)));
  return repairs
    .filter((repair) => repair.status === "DELIVERED")
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    )
    .slice(0, safeLimit);
}

export function prepareKnowledgeProposalEvidence(
  repairs: readonly Repair[],
  eventsByRepairId: Readonly<Record<string, readonly RepairEvent[]>>,
): KnowledgeProposalRepairEvidence[] {
  return selectDeliveredRepairsForKnowledgeProposal(repairs)
    .map((repair): KnowledgeProposalRepairEvidence => {
      const events = (eventsByRepairId[repair.id] ?? [])
        .filter((event) => event.repairId === repair.id);
      const contents = (type: RepairEvent["type"]) => uniqueLimited(
        events.filter((event) => event.type === type).map((event) => event.content),
      );

      return {
        repairId: repair.id,
        brand: limitText(repair.brand),
        model: limitText(repair.model),
        reportedIssue: limitText(repair.reportedIssue),
        notes: contents("NOTE"),
        measurements: contents("MEASUREMENT"),
        confirmedDiagnosisEvents: contents("DIAGNOSIS"),
        confirmedRepairEvents: contents("REPAIR"),
        confirmedRepairDiagnosis: repair.diagnosis
          ? limitText(repair.diagnosis)
          : null,
        confirmedRepairSolution: repair.solution
          ? limitText(repair.solution)
          : null,
      };
    })
    .filter(isConfirmedEvidence);
}

export function selectKnowledgeDocumentsForProposal(
  documents: readonly KnowledgeDocument[],
  evidence: readonly KnowledgeProposalRepairEvidence[],
  limit = MAX_PROPOSAL_DOCUMENTS,
): KnowledgeDocument[] {
  const safeLimit = Math.max(0, Math.min(MAX_PROPOSAL_DOCUMENTS, Math.floor(limit)));
  const tags = new Set(identifyKnowledgeTags(evidence.map((item) => [
    item.reportedIssue,
    ...item.notes,
    ...item.measurements,
    ...item.confirmedDiagnosisEvents,
    ...item.confirmedRepairEvents,
    item.confirmedRepairDiagnosis ?? "",
    item.confirmedRepairSolution ?? "",
  ].join("\n")).join("\n")));

  return documents
    .map((document) => ({
      document,
      score: document.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) =>
      right.score - left.score || left.document.id.localeCompare(right.document.id),
    )
    .slice(0, safeLimit)
    .map(({ document }) => document);
}

export function buildKnowledgeProposalRequestContent(
  evidence: readonly KnowledgeProposalRepairEvidence[],
  documents: readonly KnowledgeDocument[],
): string {
  return JSON.stringify({
    deliveredRepairEvidence: evidence.slice(0, MAX_PROPOSAL_REPAIRS),
    relatedKnowledgeDocuments: documents.slice(0, MAX_PROPOSAL_DOCUMENTS).map(
      ({ id, title, tags, content }) => ({
        id,
        title: limitText(title),
        tags: tags.slice(0, 12),
        content: content.slice(0, 4_000),
      }),
    ),
  });
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidates = [
    trimmed,
    fenced,
    firstBrace >= 0 && lastBrace > firstBrace
      ? trimmed.slice(firstBrace, lastBrace + 1)
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of new Set(candidates)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next safe wrapper. Zod validation follows below.
    }
  }
  throw new Error("El modelo local devolvió candidatos con JSON inválido.");
}

export function parseKnowledgeProposalResponse(
  content: string,
  evidence: readonly KnowledgeProposalRepairEvidence[],
  documents: readonly KnowledgeDocument[],
): KnowledgeProposalCandidate[] {
  const parsed = parseModelJson(content);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as { candidates?: unknown }).candidates)
  ) {
    throw new Error("Los candidatos no cumplieron el formato esperado. No se guardó ningún documento.");
  }

  const allowedRepairIds = new Set(evidence.filter(isConfirmedEvidence).map(({ repairId }) => repairId));
  const allowedDocumentIds = new Set(documents.map(({ id }) => id));
  const rawCandidates = (parsed as { candidates: unknown[] }).candidates.slice(0, 3);
  if (rawCandidates.length === 0) return [];

  const candidates: KnowledgeProposalCandidate[] = [];
  let rejectedProvenance = false;
  let rejectedTarget = false;

  for (const rawCandidate of rawCandidates) {
    const normalizedUpdateCandidate =
      rawCandidate &&
      typeof rawCandidate === "object" &&
      !Array.isArray(rawCandidate) &&
      (rawCandidate as { operation?: unknown }).operation === "update" &&
      typeof (rawCandidate as { targetDocumentId?: unknown }).targetDocumentId === "string" &&
      allowedDocumentIds.has(
        (rawCandidate as { targetDocumentId: string }).targetDocumentId,
      )
        ? {
            ...rawCandidate,
            // The target is authoritative for updates. Small local models can
            // otherwise invent a second ID even when the target is valid.
            id: (rawCandidate as { targetDocumentId: string }).targetDocumentId,
          }
        : rawCandidate;
    const normalizedCandidate =
      normalizedUpdateCandidate &&
      typeof normalizedUpdateCandidate === "object" &&
      !Array.isArray(normalizedUpdateCandidate) &&
      (normalizedUpdateCandidate as { operation?: unknown }).operation === "new"
        ? {
            ...normalizedUpdateCandidate,
            id: uniqueDocumentId(
              normalizeDocumentId(
                (normalizedUpdateCandidate as { id?: unknown }).id,
                (normalizedUpdateCandidate as { title?: unknown }).title,
              ),
              new Set([
                ...allowedDocumentIds,
                ...candidates.map(({ id }) => id),
              ]),
            ),
          }
        : normalizedUpdateCandidate;
    const result = knowledgeProposalCandidateSchema.safeParse(normalizedCandidate);
    if (!result.success) continue;

    const candidate = result.data;
    if (candidate.sourceRepairIds.some((id) => !allowedRepairIds.has(id))) {
      rejectedProvenance = true;
      continue;
    }
    if (
      candidate.operation === "update" &&
      (!candidate.targetDocumentId || !allowedDocumentIds.has(candidate.targetDocumentId))
    ) {
      rejectedTarget = true;
      continue;
    }
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    if (rejectedProvenance) {
      throw new Error("Un candidato citó una reparación sin evidencia confirmada. No se guardó ningún documento.");
    }
    if (rejectedTarget) {
      throw new Error("Un candidato intentó actualizar un documento que no fue enviado al modelo.");
    }
    throw new Error("Los candidatos no cumplieron el formato esperado. No se guardó ningún documento.");
  }

  return deduplicateKnowledgeProposals(candidates, documents);
}

export function classifyKnowledgeProposal(
  candidate: KnowledgeProposalCandidate,
  documents: readonly KnowledgeDocument[],
): KnowledgeProposalClassification {
  const target = candidate.targetDocumentId
    ? documents.find(({ id }) => id === candidate.targetDocumentId)
    : documents.find(({ id }) => id === candidate.id);
  if (target) {
    if (
      normalizeText(target.content) === normalizeText(candidate.content) &&
      sameTags(target.tags, candidate.tags)
    ) {
      return { kind: "duplicate", document: target };
    }
    return { kind: "update", document: target };
  }

  const contentDuplicate = documents.find((document) =>
    normalizeText(document.content) === normalizeText(candidate.content) &&
    sameTags(document.tags, candidate.tags),
  );
  return contentDuplicate
    ? { kind: "duplicate", document: contentDuplicate }
    : { kind: "new" };
}

export function deduplicateKnowledgeProposals(
  candidates: readonly KnowledgeProposalCandidate[],
  documents: readonly KnowledgeDocument[],
): KnowledgeProposalCandidate[] {
  const accepted: KnowledgeProposalCandidate[] = [];
  for (const candidate of candidates) {
    if (classifyKnowledgeProposal(candidate, documents).kind === "duplicate") continue;
    const duplicateCandidate = accepted.some((item) =>
      item.id === candidate.id ||
      (
        normalizeText(item.content) === normalizeText(candidate.content) &&
        sameTags(item.tags, candidate.tags)
      ),
    );
    if (!duplicateCandidate) accepted.push(candidate);
  }
  return accepted;
}

export function buildKnowledgeProposalMutation(
  candidate: KnowledgeProposalCandidate,
  documents: readonly KnowledgeDocument[],
  confirmed: boolean,
): KnowledgeProposalMutation {
  if (!confirmed) {
    throw new Error("Revisá y confirmá la propuesta antes de guardarla.");
  }
  const validCandidate = knowledgeProposalCandidateSchema.parse(candidate);
  const classification = classifyKnowledgeProposal(validCandidate, documents);
  if (classification.kind === "duplicate") {
    throw new Error(`La propuesta duplica el documento ${classification.document.id}.`);
  }

  const normalizedSources = [...new Set(validCandidate.sourceRepairIds)].sort();
  if (classification.kind === "update") {
    return {
      kind: "update",
      id: classification.document.id,
      input: {
        title: validCandidate.title,
        tags: [...new Set(validCandidate.tags.map((tag) => tag.trim()).filter(Boolean))],
        content: validCandidate.content.trim(),
        sources: [...new Set([...classification.document.sources, ...normalizedSources])].sort(),
      },
    };
  }

  return {
    kind: "create",
    id: validCandidate.id,
    input: {
      id: validCandidate.id,
      title: validCandidate.title,
      tags: [...new Set(validCandidate.tags.map((tag) => tag.trim()).filter(Boolean))],
      content: validCandidate.content.trim(),
      sources: normalizedSources,
      status: "draft",
    },
  };
}
