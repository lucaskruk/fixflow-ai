export type WebGPUCompatibility =
  | {
      supported: true;
      adapterLabel: string | null;
      shaderF16: boolean;
    }
  | {
      supported: false;
      reason: "API_UNAVAILABLE" | "ADAPTER_UNAVAILABLE" | "CHECK_FAILED";
      message: string;
    };

type GPUAdapterLike = {
  features?: { has(name: string): boolean };
  info?: {
    vendor?: string;
    architecture?: string;
    description?: string;
  };
};

type NavigatorWithGPU = {
  gpu?: {
    requestAdapter(options?: {
      powerPreference?: "low-power" | "high-performance";
    }): Promise<GPUAdapterLike | null>;
  };
};

export async function checkWebGPU(
  navigatorLike: NavigatorWithGPU | undefined =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as NavigatorWithGPU),
): Promise<WebGPUCompatibility> {
  if (!navigatorLike?.gpu) {
    return {
      supported: false,
      reason: "API_UNAVAILABLE",
      message:
        "WebGPU no está disponible. Abrí FixFlow AI en una versión reciente de Chrome y verificá la aceleración por hardware.",
    };
  }

  try {
    // Chrome ignores powerPreference on Windows and emits a console warning.
    // Let the browser select the only available adapter instead.
    const adapter = await navigatorLike.gpu.requestAdapter();

    if (!adapter) {
      return {
        supported: false,
        reason: "ADAPTER_UNAVAILABLE",
        message:
          "Chrome detecta WebGPU, pero no pudo acceder a la GPU. Revisá la aceleración por hardware y el controlador de video.",
      };
    }

    const adapterLabel = [
      adapter.info?.vendor,
      adapter.info?.architecture,
      adapter.info?.description,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" · ");

    return {
      supported: true,
      adapterLabel: adapterLabel || null,
      shaderF16: adapter.features?.has("shader-f16") ?? false,
    };
  } catch {
    return {
      supported: false,
      reason: "CHECK_FAILED",
      message:
        "No se pudo inicializar WebGPU. Probá en Chrome con la aceleración por hardware habilitada.",
    };
  }
}
