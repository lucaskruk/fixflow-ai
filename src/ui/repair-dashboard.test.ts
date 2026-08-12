import { describe, expect, it } from "vitest";
import type { Repair, RepairStatus } from "../domain/schemas";
import {
  DASHBOARD_VIEW_STORAGE_KEY,
  countRepairsByTab,
  filterRepairs,
  loadRepairViewMode,
  persistRepairViewMode,
  type DashboardPreferenceStorage,
} from "./repair-dashboard";

function repair(id: string, status: RepairStatus, overrides: Partial<Repair> = {}): Repair {
  return {
    id,
    customerName: "Cliente de prueba",
    customerPhone: null,
    brand: "Marca",
    model: "Modelo",
    serialNumber: null,
    reportedIssue: "No enciende",
    accessories: [],
    status,
    diagnosis: null,
    solution: null,
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
    ...overrides,
  };
}

function storage(initial: string | null = null): DashboardPreferenceStorage & { value: string | null } {
  return {
    value: initial,
    getItem(key) {
      return key === DASHBOARD_VIEW_STORAGE_KEY ? this.value : null;
    },
    setItem(key, value) {
      if (key === DASHBOARD_VIEW_STORAGE_KEY) this.value = value;
    },
  };
}

describe("repair dashboard filters", () => {
  const repairs = [
    repair("active-received", "RECEIVED", { customerName: "María Gómez" }),
    repair("active-diagnosing", "DIAGNOSING"),
    repair("active-repairing", "REPAIRING"),
    repair("active-ready", "READY", { serialNumber: "SN-ABC" }),
    repair("delivered", "DELIVERED", { customerName: "Lucas" }),
  ];

  it("separates every non-delivered status from delivered repairs", () => {
    expect(filterRepairs(repairs, "active", "").map(({ id }) => id)).toEqual([
      "active-received",
      "active-diagnosing",
      "active-repairing",
      "active-ready",
    ]);
    expect(filterRepairs(repairs, "delivered", "").map(({ id }) => id)).toEqual([
      "delivered",
    ]);
    expect(countRepairsByTab(repairs)).toEqual({ active: 4, delivered: 1 });
  });

  it("applies the same accent-insensitive search inside the selected tab", () => {
    expect(filterRepairs(repairs, "active", "maria").map(({ id }) => id)).toEqual([
      "active-received",
    ]);
    expect(filterRepairs(repairs, "active", "SN-ABC").map(({ id }) => id)).toEqual([
      "active-ready",
    ]);
    expect(filterRepairs(repairs, "active", "Lucas")).toEqual([]);
  });
});

describe("repair dashboard view preference", () => {
  it("persists and restores list view", () => {
    const preferenceStorage = storage();

    persistRepairViewMode("list", preferenceStorage);

    expect(loadRepairViewMode(preferenceStorage)).toBe("list");
  });

  it("falls back to cards for unknown values or unavailable storage", () => {
    expect(loadRepairViewMode(storage("unknown"))).toBe("cards");

    const blockedStorage: DashboardPreferenceStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(loadRepairViewMode(blockedStorage)).toBe("cards");
    expect(() => persistRepairViewMode("list", blockedStorage)).not.toThrow();
  });
});
