import type { RepairStatus } from "../domain/schemas";
import { statusLabels } from "../ui/repair-display";

export function StatusBadge({ status }: { status: RepairStatus }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
