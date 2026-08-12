import { z } from "zod";
import {
  createAISuggestionEventInputSchema,
  createRepairInputSchema,
  createTechnicianRepairEventInputSchema,
  repairEventSchema,
  repairSchema,
  updateRepairInputSchema,
  type CreateTechnicianRepairEventInput,
  type CreateRepairInput,
  type Repair,
  type RepairEvent,
  type UpdateRepairInput,
} from "../domain/schemas";

const repairResponseSchema = z.object({ data: repairSchema });
const repairsResponseSchema = z.object({ data: z.array(repairSchema) });
const eventResponseSchema = z.object({ data: repairEventSchema });
const eventsResponseSchema = z.object({ data: z.array(repairEventSchema) });
const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

export const repairsApi = {
  async list(signal?: AbortSignal): Promise<Repair[]> {
    return (await request("/api/repairs", repairsResponseSchema, signal ? { signal } : undefined)).data;
  },

  async get(id: string, signal?: AbortSignal): Promise<Repair> {
    return (await request(`/api/repairs/${encodeURIComponent(id)}`, repairResponseSchema, signal ? { signal } : undefined)).data;
  },

  async create(input: CreateRepairInput): Promise<Repair> {
    const validInput = createRepairInputSchema.parse(input);
    return (await request("/api/repairs", repairResponseSchema, {
      method: "POST",
      body: JSON.stringify(validInput),
    })).data;
  },

  async update(id: string, input: UpdateRepairInput): Promise<Repair> {
    const validInput = updateRepairInputSchema.parse(input);
    return (await request(`/api/repairs/${encodeURIComponent(id)}`, repairResponseSchema, {
      method: "PATCH",
      body: JSON.stringify(validInput),
    })).data;
  },

  async listEvents(id: string, signal?: AbortSignal): Promise<RepairEvent[]> {
    return (await request(`/api/repairs/${encodeURIComponent(id)}/events`, eventsResponseSchema, signal ? { signal } : undefined)).data;
  },

  async addEvent(id: string, input: CreateTechnicianRepairEventInput): Promise<RepairEvent> {
    const validInput = createTechnicianRepairEventInputSchema.parse(input);
    return (await request(`/api/repairs/${encodeURIComponent(id)}/events`, eventResponseSchema, {
      method: "POST",
      body: JSON.stringify(validInput),
    })).data;
  },

  async addAISuggestion(
    id: string,
    input: { content: string },
  ): Promise<RepairEvent> {
    const validInput = createAISuggestionEventInputSchema.parse(input);
    return (await request(
      `/api/repairs/${encodeURIComponent(id)}/events/ai-suggestions`,
      eventResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(validInput),
      },
    )).data;
  },
};
