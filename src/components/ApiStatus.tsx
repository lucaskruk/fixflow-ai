import { useEffect, useState } from "react";

type ConnectionState = "checking" | "connected" | "unavailable";

type HealthResponse = {
  status: "ok";
  service: "fixflow-ai";
};

export function ApiStatus() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Health check failed");
        }

        const body = (await response.json()) as HealthResponse;
        setConnectionState(
          body.status === "ok" && body.service === "fixflow-ai"
            ? "connected"
            : "unavailable",
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setConnectionState("unavailable");
      }
    }

    void checkApi();

    return () => controller.abort();
  }, []);

  const labels: Record<ConnectionState, string> = {
    checking: "Comprobando API",
    connected: "API conectada",
    unavailable: "API no disponible",
  };

  return (
    <span className={`api-status api-status--${connectionState}`}>
      <span className="api-status__dot" aria-hidden="true" />
      {labels[connectionState]}
    </span>
  );
}

