import { z } from "zod";
import { authenticatedFetch } from "../auth/auth-store";
import {
  gatewayGenerationRequestSchema,
  gatewayGenerationResponseSchema,
  type GatewayGenerationRequest,
  type GatewayGenerationResponse,
} from "../ai/gateway-contract";
import { ApiError } from "./repairs";

const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export async function generateWithGateway(
  input: GatewayGenerationRequest,
): Promise<GatewayGenerationResponse> {
  const validInput = gatewayGenerationRequestSchema.parse(input);
  let response: Response;
  try {
    response = await authenticatedFetch("/api/ai/gateway/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validInput),
    });
  } catch {
    throw new ApiError(
      "No pudimos conectar con el servidor para usar Vercel AI Gateway.",
      0,
      "NETWORK_ERROR",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error.message : "Vercel AI Gateway no pudo completar la solicitud.",
      response.status,
      parsed.success ? parsed.data.error.code : "UNKNOWN_ERROR",
    );
  }

  const parsed = gatewayGenerationResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      "El servidor devolvió una respuesta inesperada de Vercel AI Gateway.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return parsed.data.data;
}
