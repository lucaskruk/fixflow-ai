import {
  createDiagnosticAnalysisJsonSchema,
  createKnowledgeProposalJsonSchema,
  repairDraftJsonSchema,
} from "../src/ai/model-config";
import {
  buildDiagnosisRequestContent,
  diagnosisSystemPrompt,
  extractionSystemPrompt,
  finalReportSystemPrompt,
  knowledgeProposalSystemPrompt,
} from "../src/ai/ai-prompts";
import type { GatewayGenerationRequest } from "../src/ai/gateway-contract";
import { buildFinalReportRequestContent, finalReportJsonSchema } from "../src/ai/final-report";
import { buildKnowledgeProposalRequestContent } from "../src/ai/knowledge-proposals";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

type GatewayUpstreamFailure = {
  status: number;
  code: string;
  message: string;
};

export class GatewayRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GatewayRequestError";
  }
}

type GatewayTask = {
  system: string;
  user: string;
  schema: object;
  maxTokens: number;
};

function systemContentFor(task: GatewayTask): string {
  return `${task.system}\n\nEsquema JSON requerido:\n${JSON.stringify(task.schema)}`;
}

function mapUpstreamFailure(status: number): GatewayUpstreamFailure {
  switch (status) {
    case 401:
      return {
        status: 502,
        code: "GATEWAY_AUTH_FAILED",
        message: "Vercel rechazó AI_GATEWAY_API_KEY. Volvé a cargar el valor de una clave creada en Vercel AI Gateway",
      };
    case 403:
      return {
        status: 502,
        code: "GATEWAY_ACCESS_DENIED",
        message: "Vercel AI Gateway requiere una tarjeta válida para habilitar créditos, o la cuenta no tiene acceso. Revisá la facturación y los permisos en Vercel",
      };
    case 404:
      return {
        status: 502,
        code: "GATEWAY_MODEL_NOT_FOUND",
        message: "El modelo seleccionado ya no está disponible en Vercel AI Gateway",
      };
    case 429:
      return {
        status: 429,
        code: "GATEWAY_RATE_LIMITED",
        message: "Vercel AI Gateway alcanzó el límite de uso. Volvé a intentar más tarde",
      };
    default:
      return {
        status: 502,
        code: status >= 500 ? "GATEWAY_UNAVAILABLE" : "GATEWAY_REQUEST_FAILED",
        message: status >= 500
          ? "Vercel AI Gateway no está disponible temporalmente"
          : "Vercel AI Gateway rechazó la solicitud del modelo",
      };
  }
}

function taskFor(request: GatewayGenerationRequest): GatewayTask {
  switch (request.task) {
    case "repair-extraction":
      return {
        system: extractionSystemPrompt,
        user: `Extrae los datos explícitos del siguiente ingreso y devuelve JSON:\n\n${request.input}`,
        schema: repairDraftJsonSchema,
        maxTokens: 640,
      };
    case "diagnostic-analysis": {
      const documents = request.knowledgeDocuments.slice(0, 3);
      return {
        system: diagnosisSystemPrompt,
        user: buildDiagnosisRequestContent(request.repair, request.events, documents),
        schema: createDiagnosticAnalysisJsonSchema(documents.map(({ id }) => id)),
        maxTokens: 1_600,
      };
    }
    case "final-report":
      return {
        system: finalReportSystemPrompt,
        user: buildFinalReportRequestContent(request.repair, request.events),
        schema: finalReportJsonSchema,
        maxTokens: 1_800,
      };
    case "knowledge-proposal":
      return {
        system: knowledgeProposalSystemPrompt,
        user: buildKnowledgeProposalRequestContent(
          request.evidence,
          request.knowledgeDocuments,
        ),
        schema: createKnowledgeProposalJsonSchema(
          request.evidence.map(({ repairId }) => repairId),
          request.knowledgeDocuments.map(({ id }) => id),
        ),
        maxTokens: 2_400,
      };
  }
}

function readCompletion(value: unknown): { content: string; finishReason: string | null } {
  if (!value || typeof value !== "object") {
    throw new GatewayRequestError(502, "GATEWAY_INVALID_RESPONSE", "Vercel AI Gateway devolvió una respuesta inválida");
  }
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    throw new GatewayRequestError(502, "GATEWAY_INVALID_RESPONSE", "Vercel AI Gateway no devolvió una respuesta del modelo");
  }
  const choice = choices[0] as {
    message?: { content?: unknown };
    finish_reason?: unknown;
  };
  const content = choice.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new GatewayRequestError(502, "GATEWAY_EMPTY_RESPONSE", "El modelo remoto no devolvió contenido");
  }
  return {
    content,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
  };
}

export async function generateWithVercelGateway(
  request: GatewayGenerationRequest,
  apiKey: string | undefined,
): Promise<{ modelId: GatewayGenerationRequest["modelId"]; content: string; finishReason: string | null }> {
  const normalizedApiKey = apiKey?.trim();
  if (!normalizedApiKey) {
    throw new GatewayRequestError(
      503,
      "GATEWAY_NOT_CONFIGURED",
      "Vercel AI Gateway todavía no está configurado en el servidor",
    );
  }

  const task = taskFor(request);
  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalizedApiKey}`,
        "Content-Type": "application/json",
        "X-Title": "FixFlow AI",
      },
      body: JSON.stringify({
        model: request.modelId,
        messages: [
          { role: "system", content: systemContentFor(task) },
          { role: "user", content: task.user },
        ],
        reasoning: { enabled: false },
        temperature: 0,
        max_tokens: task.maxTokens,
      }),
    });
  } catch {
    throw new GatewayRequestError(
      502,
      "GATEWAY_UNAVAILABLE",
      "No pudimos conectar con Vercel AI Gateway",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const upstreamMessage = body && typeof body === "object"
      ? (body as { error?: { message?: unknown } }).error?.message
      : null;
    console.error("Vercel AI Gateway request failed", {
      status: response.status,
      modelId: request.modelId,
      task: request.task,
      upstreamMessage: typeof upstreamMessage === "string" ? upstreamMessage : undefined,
    });
    const failure = mapUpstreamFailure(response.status);
    throw new GatewayRequestError(
      failure.status,
      failure.code,
      failure.message,
    );
  }

  return { modelId: request.modelId, ...readCompletion(body) };
}
