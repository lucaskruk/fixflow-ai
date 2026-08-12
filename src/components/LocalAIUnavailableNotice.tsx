import type { LocalAIFailure } from "../ai/webllm-local-ai-service";

export function LocalAIUnavailableNotice({
  failure,
}: {
  failure: LocalAIFailure;
}) {
  return (
    <div
      className="webgpu-warning"
      role="alert"
      data-local-ai-error={failure.code}
    >
      <strong>{failure.title}</strong>
      <span>{failure.message}</span>
      <small>
        La reparación, las mediciones y las observaciones se pueden seguir usando
        normalmente. La IA no guardó ningún cambio.
      </small>
    </div>
  );
}
