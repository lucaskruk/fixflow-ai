import type { LocalAIDebugOutput } from "../ai/webllm-local-ai-service";

export function LocalAIDebugPanel({
  output,
}: {
  output: LocalAIDebugOutput;
}) {
  if (!import.meta.env.DEV) return null;

  return (
    <details className="ai-debug-panel">
      <summary>Ver salida cruda del modelo para depuración</summary>
      <dl>
        <div><dt>Modelo</dt><dd>{output.modelId}</dd></div>
        <div><dt>Tarea</dt><dd>{output.task}</dd></div>
        <div><dt>Finalización</dt><dd>{output.finishReason ?? "No informada"}</dd></div>
        <div><dt>Longitud</dt><dd>{output.contentLength} caracteres</dd></div>
      </dl>
      <pre>{output.content || "(respuesta vacía)"}</pre>
      <small>
        Este panel sólo aparece durante el desarrollo. La salida permanece en
        este navegador y puede contener datos de la reparación actual.
      </small>
    </details>
  );
}
