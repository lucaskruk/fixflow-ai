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
  schemaName: string;
  schema: object;
  maxTokens: number;
};

function taskFor(request: GatewayGenerationRequest): GatewayTask {
  switch (request.task) {
    case "repair-extraction":
      return {
        system: extractionSystemPrompt,
        user: `Extrae los datos explícitos del siguiente ingreso y devuelve JSON:\n\n${request.input}`,
        schemaName: "repair_draft",
        schema: repairDraftJsonSchema,
        maxTokens: 320,
      };
    case "diagnostic-analysis": {
      const documents = request.knowledgeDocuments.slice(0, 3);
      return {
        system: diagnosisSystemPrompt,
        user: buildDiagnosisRequestContent(request.repair, request.events, documents),
        schemaName: "diagnostic_analysis",
        schema: createDiagnosticAnalysisJsonSchema(documents.map(({ id }) => id)),
        maxTokens: 950,
      };
    }
    case "final-report":
      return {
        system: finalReportSystemPrompt,
        user: buildFinalReportRequestContent(request.repair, request.events),
        schemaName: "final_report",
        schema: finalReportJsonSchema,
        maxTokens: 1_150,
      };
    case "knowledge-proposal":
      return {
        system: knowledgeProposalSystemPrompt,
        user: buildKnowledgeProposalRequestContent(
          request.evidence,
          request.knowledgeDocuments,
        ),
        schemaName: "knowledge_proposals",
        schema: createKnowledgeProposalJsonSchema(
          request.evidence.map(({ repairId }) => repairId),
          request.knowledgeDocuments.map(({ id }) => id),
        ),
        maxTokens: 1_350,
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
  if (!apiKey) {
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
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "FixFlow AI",
      },
      body: JSON.stringify({
        model: request.modelId,
        messages: [
          { role: "system", content: task.system },
          { role: "user", content: task.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: task.schemaName,
            strict: true,
            schema: task.schema,
          },
        },
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
    throw new GatewayRequestError(
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "GATEWAY_RATE_LIMITED" : "GATEWAY_REQUEST_FAILED",
      response.status === 429
        ? "Vercel AI Gateway alcanzó el límite de uso. Volvé a intentar más tarde"
        : "Vercel AI Gateway no pudo completar la solicitud",
    );
  }

  return { modelId: request.modelId, ...readCompletion(body) };
}
