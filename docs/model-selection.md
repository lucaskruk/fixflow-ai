# Selección del modelo local

## Hardware objetivo medido

- AMD Ryzen 5 2400G, 8 hilos
- 15 GB de RAM física
- AMD Radeon RX Vega 11 integrada, 2 GB de VRAM asignada
- Google Chrome 151

## Modelos seleccionados por tarea

Extracción de ingreso: `SmolLM2-360M-Instruct-q4f32_1-MLC`.

Análisis diagnóstico: `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`.

El catálogo incluido en WebLLM estima 579.61 MB de VRAM para esta variante y
no declara `shader-f16` como requisito. Los artefactos del repositorio MLC suman
aproximadamente 207 MB. Se conserva el contexto oficial de 4096 tokens de esta
variante y se limita la longitud de cada sección del análisis para evitar
respuestas truncadas en el modelo pequeño.

La prueba física confirmó que SmolLM2 carga con menor consumo, pero no sigue de
forma fiable el contrato JSON del análisis: repite marcadores, inventa claves y
termina por longitud. Por eso queda limitado a la extracción breve. Qwen se usa
para diagnóstico por su mejor seguimiento de instrucciones en español y JSON.
En la Vega 11 puede no ser viable; FixFlow informa el fallo sin alterar el CRUD.
En equipos con más margen, como Apple Silicon, es la opción recomendada. Ambos
permanecen en el catálogo interno para una futura página de Settings.

## Fuentes oficiales

- [Catálogo y requisitos de modelos de WebLLM](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
- [WebLLM: WebGPU, JSON mode, workers y caché](https://github.com/mlc-ai/web-llm)
- [Qwen2.5: idiomas y salida estructurada](https://qwenlm.github.io/blog/qwen2.5/)
- [Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
- [SmolLM2-360M compilado para WebLLM](https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f32_1-MLC)
- [Compatibilidad WebGPU en Chrome](https://developer.chrome.com/docs/web-platform/webgpu/overview)

## Comportamiento seguro

El modelo sólo se descarga por acción del técnico. Antes de cargarlo, FixFlow
solicita un adaptador WebGPU real al navegador. Si WebGPU no está disponible,
si el driver bloquea el adaptador, pierde el dispositivo o la GPU queda sin
memoria, la aplicación desactiva la IA en esa pestaña, explica el problema y
conserva íntegramente el flujo manual.
