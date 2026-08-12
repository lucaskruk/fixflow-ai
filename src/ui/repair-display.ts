import type { RepairEventType, RepairStatus } from "../domain/schemas";

export const statusLabels: Record<RepairStatus, string> = {
  RECEIVED: "Recibida",
  DIAGNOSING: "Diagnosticando",
  REPAIRING: "En reparación",
  READY: "Lista",
  DELIVERED: "Entregada",
};

export const eventLabels: Record<RepairEventType, string> = {
  NOTE: "Observación",
  MEASUREMENT: "Medición",
  AI_SUGGESTION: "Sugerencia de IA",
  DIAGNOSIS: "Diagnóstico confirmado",
  REPAIR: "Reparación",
};

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function shortRepairId(id: string): string {
  return id.startsWith("FF-") ? id : `#${id}`;
}
