import { z } from "zod";
import {
  createKnowledgeDocumentInputSchema,
  knowledgeDocumentSchema,
  listKnowledgeDocumentsInputSchema,
  updateKnowledgeDocumentInputSchema,
  type CreateKnowledgeDocumentInput,
  type KnowledgeDocument,
  type ListKnowledgeDocumentsInput,
  type UpdateKnowledgeDocumentInput,
} from "../domain/schemas";
import { ApiError } from "./repairs";

const documentResponseSchema = z.object({ data: knowledgeDocumentSchema });
const documentsResponseSchema = z.object({ data: z.array(knowledgeDocumentSchema) });
const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    const requestInit: RequestInit = { ...init };
    if (init?.body) {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      requestInit.headers = headers;
    }
    response = await fetch(path, requestInit);
  } catch {
    throw new ApiError(
      "No pudimos conectar con el servidor. Verificá que esté iniciado.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error.message : "La solicitud no pudo completarse.",
      response.status,
      parsed.success ? parsed.data.error.code : "UNKNOWN_ERROR",
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      "El servidor devolvió datos con un formato inesperado.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return parsed.data;
}

export const knowledgeApi = {
  async list(
    filters: ListKnowledgeDocumentsInput = {},
    signal?: AbortSignal,
  ): Promise<KnowledgeDocument[]> {
    const validFilters = listKnowledgeDocumentsInputSchema.parse(filters);
    const params = new URLSearchParams();
    if (validFilters.q) params.set("q", validFilters.q);
    if (validFilters.tag) params.set("tag", validFilters.tag);
    if (validFilters.status) params.set("status", validFilters.status);
    const query = params.size ? `?${params}` : "";
    return (await request(
      `/api/knowledge${query}`,
      documentsResponseSchema,
      signal ? { signal } : undefined,
    )).data;
  },

  async get(id: string, signal?: AbortSignal): Promise<KnowledgeDocument> {
    return (await request(
      `/api/knowledge/${encodeURIComponent(id)}`,
      documentResponseSchema,
      signal ? { signal } : undefined,
    )).data;
  },

  async create(input: CreateKnowledgeDocumentInput): Promise<KnowledgeDocument> {
    const validInput = createKnowledgeDocumentInputSchema.parse(input);
    return (await request("/api/knowledge", documentResponseSchema, {
      method: "POST",
      body: JSON.stringify(validInput),
    })).data;
  },

  async update(
    id: string,
    input: UpdateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const validInput = updateKnowledgeDocumentInputSchema.parse(input);
    return (await request(
      `/api/knowledge/${encodeURIComponent(id)}`,
      documentResponseSchema,
      { method: "PATCH", body: JSON.stringify(validInput) },
    )).data;
  },

  async delete(id: string): Promise<void> {
    await request(
      `/api/knowledge/${encodeURIComponent(id)}`,
      z.undefined(),
      { method: "DELETE" },
    );
  },
};
