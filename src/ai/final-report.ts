import { z } from "zod";
import type { Repair, RepairEvent } from "../domain/schemas";

const reportText = z.string().trim().min(1);

export const finalReportSchema = z.object({
  reportedSymptom: reportText,
  testsAndMeasurements: z.array(reportText),
  observations: z.array(reportText),
  confirmedDiagnosis: z.array(reportText),
  repairPerformed: z.array(reportText),
  finalStatus: reportText,
  recommendations: z.array(reportText),
}).strict();

export type FinalReport = z.infer<typeof finalReportSchema>;

export const finalReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reportedSymptom: { type: "string", minLength: 1, maxLength: 500 },
    testsAndMeasurements: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
    observations: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
    confirmedDiagnosis: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
    repairPerformed: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
    finalStatus: { type: "string", minLength: 1, maxLength: 200 },
    recommendations: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
  },
  required: [
    "reportedSymptom",
    "testsAndMeasurements",
    "observations",
    "confirmedDiagnosis",
    "repairPerformed",
    "finalStatus",
    "recommendations",
  ],
} as const;

const statusLabels: Record<Repair["status"], string> = {
  RECEIVED: "Recibido",
  DIAGNOSING: "En diagnóstico",
  REPAIRING: "En reparación",
  READY: "Listo para entregar",
  DELIVERED: "Entregado",
};

function contentsFor(events: readonly RepairEvent[], type: RepairEvent["type"]): string[] {
  return events
    .filter((event) => event.type === type)
    .map((event) => event.content.trim())
    .filter(Boolean);
}

export function buildFinalReportRequestContent(
  repair: Repair,
  events: readonly RepairEvent[],
): string {
  // AI_SUGGESTION is intentionally omitted: it is neither confirmed evidence
  // nor a technician-authored diagnosis.
  return JSON.stringify({
    repair: {
      id: repair.id,
      customerName: repair.customerName,
      brand: repair.brand,
      model: repair.model,
      serialNumber: repair.serialNumber,
      reportedIssue: repair.reportedIssue,
      status: repair.status,
      confirmedDiagnosis: repair.diagnosis,
      confirmedSolution: repair.solution,
    },
    technicianRecords: {
      testsAndMeasurements: contentsFor(events, "MEASUREMENT"),
      observations: contentsFor(events, "NOTE"),
      confirmedDiagnoses: contentsFor(events, "DIAGNOSIS"),
      repairsPerformed: contentsFor(events, "REPAIR"),
    },
  });
}

export function parseFinalReportResponse(content: string): FinalReport {
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
      const parsed = finalReportSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // Continue with the next safe wrapper. Strict validation follows.
    }
  }

  throw new Error("El modelo local devolvió un informe con un formato inválido.");
}

export function buildSafeFinalReport(repair: Repair, events: readonly RepairEvent[]): FinalReport {
  const diagnoses = [
    ...(repair.diagnosis ? [repair.diagnosis] : []),
    ...contentsFor(events, "DIAGNOSIS"),
  ];
  const repairs = [
    ...(repair.solution ? [repair.solution] : []),
    ...contentsFor(events, "REPAIR"),
  ];

  return {
    reportedSymptom: repair.reportedIssue,
    testsAndMeasurements: contentsFor(events, "MEASUREMENT"),
    observations: contentsFor(events, "NOTE"),
    confirmedDiagnosis: diagnoses,
    repairPerformed: repairs,
    finalStatus: statusLabels[repair.status],
    recommendations: [
      "Revisar este borrador contra la ficha y completar cualquier dato faltante antes de entregarlo.",
    ],
  };
}

function renderList(items: readonly string[], emptyText: string): string {
  return items.length > 0
    ? items.map((item) => `- ${item}`).join("\n")
    : `- ${emptyText}`;
}

export function formatFinalReport(report: FinalReport, repair: Repair): string {
  return [
    `INFORME FINAL DE REPARACIÓN ${repair.id}`,
    `Equipo: ${repair.brand} ${repair.model}`,
    `Cliente: ${repair.customerName}`,
    repair.serialNumber ? `Número de serie: ${repair.serialNumber}` : "Número de serie: No informado",
    "",
    "SÍNTOMA INFORMADO",
    report.reportedSymptom,
    "",
    "PRUEBAS Y MEDICIONES",
    renderList(report.testsAndMeasurements, "No se registraron pruebas o mediciones."),
    "",
    "OBSERVACIONES",
    renderList(report.observations, "No se registraron observaciones."),
    "",
    "DIAGNÓSTICO CONFIRMADO",
    renderList(report.confirmedDiagnosis, "No hay un diagnóstico confirmado registrado."),
    "",
    "REPARACIÓN REALIZADA",
    renderList(report.repairPerformed, "No hay una reparación realizada registrada."),
    "",
    "ESTADO FINAL",
    report.finalStatus,
    "",
    "RECOMENDACIONES",
    renderList(report.recommendations, "Sin recomendaciones adicionales."),
  ].join("\n");
}

export function createSafeFinalReportText(repair: Repair, events: readonly RepairEvent[]): string {
  return formatFinalReport(buildSafeFinalReport(repair, events), repair);
}

export function canSaveOrExportFinalReport(report: string, reviewed: boolean): boolean {
  return reviewed && Boolean(report.trim());
}
