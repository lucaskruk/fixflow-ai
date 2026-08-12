import type { ReactNode } from "react";

export function StatePanel({
  title,
  children,
  action,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <section className={`state-panel state-panel--${tone}`} role={tone === "error" ? "alert" : undefined}>
      <div className="state-panel__icon" aria-hidden="true">
        {tone === "error" ? "!" : "F"}
      </div>
      <h2>{title}</h2>
      <div className="state-panel__copy">{children}</div>
      {action}
    </section>
  );
}
