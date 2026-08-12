import { describe, expect, it } from "vitest";
import {
  eventLabels,
  technicianEventGuidance,
  technicianEventTypes,
} from "./repair-display";

describe("technician timeline event options", () => {
  it("offers every manual technical record without exposing AI suggestions", () => {
    expect(technicianEventTypes).toEqual([
      "MEASUREMENT",
      "NOTE",
      "DIAGNOSIS",
      "REPAIR",
    ]);
    expect(technicianEventTypes).not.toContain("AI_SUGGESTION");
  });

  it("labels and explains confirmed diagnosis and repair records", () => {
    expect(eventLabels.DIAGNOSIS).toBe("Diagnóstico confirmado");
    expect(eventLabels.REPAIR).toBe("Reparación");
    expect(technicianEventGuidance.DIAGNOSIS.description).toContain("confirmada");
    expect(technicianEventGuidance.REPAIR.placeholder).toContain("reemplazado");
  });
});
