import type { Repair } from "../domain/schemas";

export const DASHBOARD_VIEW_STORAGE_KEY = "fixflow.dashboard.view-mode";

export const repairTabs = ["active", "delivered"] as const;
export const repairViewModes = ["cards", "list"] as const;

export type RepairTab = (typeof repairTabs)[number];
export type RepairViewMode = (typeof repairViewModes)[number];
export type DashboardPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): DashboardPreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRepairViewMode(value: string | null): value is RepairViewMode {
  return value !== null && repairViewModes.some((mode) => mode === value);
}

export function loadRepairViewMode(
  storage: DashboardPreferenceStorage | null = browserStorage(),
): RepairViewMode {
  if (!storage) return "cards";
  try {
    const stored = storage.getItem(DASHBOARD_VIEW_STORAGE_KEY);
    return isRepairViewMode(stored) ? stored : "cards";
  } catch {
    return "cards";
  }
}

export function persistRepairViewMode(
  mode: RepairViewMode,
  storage: DashboardPreferenceStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DASHBOARD_VIEW_STORAGE_KEY, mode);
  } catch {
    // Storage restrictions must not prevent technicians from using the dashboard.
  }
}

export function countRepairsByTab(repairs: readonly Repair[]): Record<RepairTab, number> {
  return repairs.reduce<Record<RepairTab, number>>(
    (counts, repair) => {
      counts[repair.status === "DELIVERED" ? "delivered" : "active"] += 1;
      return counts;
    },
    { active: 0, delivered: 0 },
  );
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function filterRepairs(
  repairs: readonly Repair[],
  tab: RepairTab,
  query: string,
): Repair[] {
  const normalizedQuery = normalizeSearchValue(query.trim());

  return repairs.filter((repair) => {
    const belongsToTab = tab === "delivered"
      ? repair.status === "DELIVERED"
      : repair.status !== "DELIVERED";

    if (!belongsToTab) return false;
    if (!normalizedQuery) return true;

    return [
      repair.id,
      repair.customerName,
      repair.customerPhone ?? "",
      repair.brand,
      repair.model,
      repair.serialNumber ?? "",
      repair.reportedIssue,
    ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
  });
}
