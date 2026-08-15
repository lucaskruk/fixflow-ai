import type { AIFailure } from "../ai/ai-runtime";

export function LocalAIUnavailableNotice({
  failure,
}: {
  failure: AIFailure;
}) {
  return (
    <div
      className="webgpu-warning"
      role="alert"
      data-ai-error={failure.code}
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
