# Selección del modelo local

## Hardware objetivo medido

- AMD Ryzen 5 2400G, 8 hilos
- 15 GB de RAM física
- AMD Radeon RX Vega 11 integrada, 2 GB de VRAM asignada
- Google Chrome 151

## Modelo seleccionado

`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`

El catálogo incluido en WebLLM 0.2.84 estima 944.62 MB de VRAM para esta
variante. Los artefactos del repositorio MLC suman aproximadamente 290 MB. La
aplicación limita además el contexto a 2048 tokens para conservar margen en la
GPU integrada.

Se prefirió Qwen2.5 0.5B frente a SmolLM2 360M porque Qwen declara soporte para
español, mejor seguimiento de instrucciones y mejoras específicas en salida
estructurada/JSON. Variantes de 1.5B o superiores no dejan un margen razonable
en los 2 GB disponibles para una demostración fiable.

## Fuentes oficiales

- [Catálogo y requisitos de modelos de WebLLM](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [WebLLM: WebGPU, JSON mode, workers y caché](https://github.com/mlc-ai/web-llm)
- [Qwen2.5: idiomas y salida estructurada](https://qwenlm.github.io/blog/qwen2.5/)
- [Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
- [Compatibilidad WebGPU en Chrome](https://developer.chrome.com/docs/web-platform/webgpu/overview)

## Comportamiento seguro

El modelo sólo se descarga por acción del técnico. Antes de cargarlo, FixFlow
solicita un adaptador WebGPU real al navegador. Si WebGPU no está disponible,
si el driver bloquea el adaptador o si la GPU queda sin memoria, la aplicación
muestra una advertencia y conserva íntegramente el flujo manual.
