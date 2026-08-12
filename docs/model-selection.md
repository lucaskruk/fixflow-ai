# Selección del modelo local

## Hardware objetivo medido

- AMD Ryzen 5 2400G, 8 hilos
- 15 GB de RAM física
- AMD Radeon RX Vega 11 integrada, 2 GB de VRAM asignada
- Google Chrome 151

## Catálogo seleccionable

FixFlow usa una única selección para extracción de ingreso y análisis
diagnóstico. Se persiste en `localStorage` por navegador y cambiarla no inicia
ninguna descarga. El catálogo se contrastó con el incluido en
`@mlc-ai/web-llm` 0.2.84:

| Categoría | Modelo | Descarga aproximada | VRAM estimada | Contexto | Requisitos | Hardware orientativo |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Básico | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | 290 MB | 945 MB | 4096 | WebGPU; sin `shader-f16` obligatorio | Mínimo: cerca de 1 GB disponible. Recomendado: GPU integrada moderna o Apple Silicon con margen. |
| Equilibrado | `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | 880 MB | 1630 MB | 4096 | WebGPU; sin `shader-f16` obligatorio | Mínimo: 2 GB disponibles. Recomendado: Apple Silicon o GPU con 4 GB o más. |
| Avanzado | `Qwen2.5-3B-Instruct-q4f16_1-MLC` | 1750 MB | 2505 MB | 4096 | WebGPU; sin `shader-f16` obligatorio | Mínimo: 3 GB disponibles. Recomendado: Apple Silicon reciente o GPU con 6 GB o más. |

Las descargas se redondean a partir de los artefactos publicados por MLC y la
VRAM es la estimación del catálogo, no memoria que el navegador pueda reservar
de antemano. El nombre `q4f16` no implica por sí solo que el adaptador deba
exponer `shader-f16`; ninguna de estas tres entradas lo declara como requisito.

Qwen 2.5 se eligió por su soporte documentado de español, seguimiento de
instrucciones y generación estructurada, especialmente JSON. 0.5B es el mínimo
compatible con el contrato de FixFlow. SmolLM2 se eliminó por completo porque la
prueba física mostró respuestas incoherentes, claves inventadas y finalización
por longitud en el análisis.

## Estado de la validación física

- MacBook Pro M4: Qwen 2.5 0.5B funciona correctamente.
- Ryzen 5 2400G con Vega 11 y 2 GB de VRAM: Qwen 2.5 0.5B puede fallar durante
  la carga o generación.
- Qwen 2.5 1.5B y 3B: pendientes de prueba física en los equipos objetivo. Su
  presencia en el catálogo oficial no se presenta como garantía de ejecución.

## Fuentes oficiales

- [Catálogo y requisitos de modelos de WebLLM](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [WebLLM: WebGPU, JSON mode, workers y caché](https://github.com/mlc-ai/web-llm)
- [Qwen2.5: idiomas y salida estructurada](https://qwenlm.github.io/blog/qwen2.5/)
- [Qwen2.5 0.5B compilado para WebLLM](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC)
- [Qwen2.5 1.5B compilado para WebLLM](https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC)
- [Qwen2.5 3B compilado para WebLLM](https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC)
- [Compatibilidad WebGPU en Chrome](https://developer.chrome.com/docs/web-platform/webgpu/overview)

## Comportamiento seguro

El modelo sólo se descarga mediante “Descargar y probar” en Settings o al
iniciar explícitamente una tarea de IA. FixFlow muestra tamaño y progreso,
reutiliza la Cache API, impide generaciones concurrentes y libera el engine
anterior antes de cambiar. Borrar artefactos requiere una segunda confirmación.
Si WebGPU no está disponible, el driver bloquea el adaptador, se pierde el
dispositivo o la GPU queda sin memoria, la aplicación explica el problema y
conserva íntegramente el flujo manual.
