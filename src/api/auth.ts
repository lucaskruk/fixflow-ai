import { z } from "zod";
import { authenticatedFetch } from "../auth/auth-store";

const sessionSchema = z.object({
  data: z.object({
    authenticated: z.literal(true),
    username: z.string().min(1),
    csrfToken: z.string().min(1),
  }),
});

export type AuthSession = z.infer<typeof sessionSchema>["data"];

async function readSessionResponse(response: Response): Promise<AuthSession> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Usuario o contraseña incorrectos.");
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) throw new Error("El servidor devolvió una sesión inválida.");
  return parsed.data.data;
}

export const authApi = {
  async session(signal?: AbortSignal): Promise<AuthSession | null> {
    const response = await authenticatedFetch(
      "/api/auth/session",
      signal ? { signal } : undefined,
    );
    if (response.status === 401) return null;
    return readSessionResponse(response);
  },

  async login(username: string, password: string): Promise<AuthSession> {
    const response = await authenticatedFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return readSessionResponse(response);
  },

  async logout(): Promise<void> {
    const response = await authenticatedFetch("/api/auth/logout", { method: "POST" });
    if (!response.ok && response.status !== 401) {
      throw new Error("No pudimos cerrar la sesión correctamente.");
    }
  },
};
