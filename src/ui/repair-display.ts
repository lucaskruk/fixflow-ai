import {
  technicianRepairEventTypes,
  type RepairEventType,
  type RepairStatus,
  type TechnicianRepairEventType,
} from "../domain/schemas";

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

export const technicianEventTypes = technicianRepairEventTypes;

export const technicianEventGuidance: Record<
  TechnicianRepairEventType,
  { description: string; placeholder: string }
> = {
  MEASUREMENT: {
    description: "Registrá valores, resultados de pruebas y condiciones reproducibles.",
    placeholder: "Entrada 19.4 V. Consumo 20 mA. 3.3VALW presente, 5VALW ausente.",
  },
  NOTE: {
    description: "Registrá una observación sin presentarla como medición o conclusión confirmada.",
    placeholder: "Se observa corrosión leve junto al conector de batería; pendiente limpieza e inspección.",
  },
  DIAGNOSIS: {
    description: "Usá este tipo sólo para una causa confirmada mediante evidencia técnica.",
    placeholder: "MOSFET de entrada en corto, confirmado por medición fuera de circuito.",
  },
  REPAIR: {
    description: "Detallá la intervención realizada y, cuando corresponda, su prueba de verificación.",
    placeholder: "MOSFET reemplazado. Consumo normal y cinco ciclos de encendido completados.",
  },
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
