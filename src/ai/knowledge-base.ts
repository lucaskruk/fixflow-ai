import type {
  KnowledgeDocument,
  Repair,
  RepairEvent,
} from "../domain/schemas";

export const knowledgeDocuments: readonly KnowledgeDocument[] = [
  {
    id: "kb-no-power-sequence",
    title: "Secuencia de diagnóstico: equipo que no enciende",
    tags: ["no-power", "power-sequence", "input-power", "standby-rails"],
    content:
      "Separar primero ausencia total de encendido de un equipo que enciende sin imagen. Confirmar cargador, conector y tensión de entrada; luego verificar que la tensión atraviese la etapa de MOSFET de entrada. Con alimentación desconectada, revisar resistencia a tierra antes de energizar. Si la entrada es correcta, buscar 3VALW/5VALW y sus señales de habilitación. Después comprobar botón de encendido, EC, BIOS y secuencia de fuentes secundarias. Registrar cada valor; una fuente ausente orienta el próximo paso, pero no confirma por sí sola el componente defectuoso.",
  },
  {
    id: "kb-input-power-stage",
    title: "Etapa de alimentación de entrada",
    tags: ["input-power", "adapter", "dc-jack", "input-mosfet", "charger-ic"],
    content:
      "Medir tensión del adaptador sin carga y conectada. Inspeccionar jack, fusible y ambos lados de los MOSFET de entrada. Comparar gate, source y drain respecto de tierra, identificando antes si son canal N o P. Verificar alimentación y señales de detección del controlador de carga según el esquema de la placa. Si la tensión no atraviesa la etapa, no asumir MOSFET dañado: un corto posterior, protección activa o ausencia de habilitación también pueden bloquearla.",
  },
  {
    id: "kb-standby-rails",
    title: "Fuentes de espera 3VALW y 5VALW",
    tags: ["standby-rails", "3valw", "5valw", "enable", "no-power"],
    content:
      "3VALW y 5VALW suelen ser fuentes de espera necesarias al inicio de la secuencia, aunque la arquitectura varía por placa. Medir entrada del convertidor, resistencia a tierra de cada salida, tensión en bobinas y señal de enable. Distinguir una salida ausente de una salida que intenta arrancar y cae. Si una fuente está presente y la otra no, comparar resistencias, MOSFETs, bobinas y habilitaciones del canal afectado. Confirmar siempre nombres y valores con boardview o esquema específico cuando esté disponible.",
  },
  {
    id: "kb-buck-converters",
    title: "Convertidores buck en placas de laptop",
    tags: ["buck-converter", "pwm", "mosfet", "inductor", "power-rail"],
    content:
      "En un buck, comprobar tensión de entrada, enable, alimentación del controlador, conmutación y salida en la bobina. Una salida nula puede deberse a falta de entrada o habilitación, protección por sobrecorriente, corto en la carga o falla del propio convertidor. Con el equipo apagado, comparar resistencia a tierra; energizado, observar si hay pulsos o intentos de arranque. No puentear protecciones ni reemplazar componentes sólo por una medición aislada.",
  },
  {
    id: "kb-short-to-ground",
    title: "Búsqueda de cortocircuitos a tierra",
    tags: ["short-to-ground", "low-resistance", "power-rail", "current-injection"],
    content:
      "Desconectar cargador y batería antes de medir resistencia a tierra. Una resistencia baja no siempre es un corto: fuentes de núcleo y GPU pueden ser naturalmente bajas. Comparar con la función de la línea, el esquema y placas conocidas. Para inyección, aislar la fuente cuando corresponda, usar tensión menor o igual a la nominal y limitar corriente desde el inicio. Buscar calentamiento de forma controlada. No inyectar en líneas desconocidas, datos, BIOS o señales sensibles.",
  },
  {
    id: "kb-battery-charging",
    title: "Diagnóstico básico del circuito de carga",
    tags: ["battery-charging", "battery", "adapter", "charger-ic"],
    content:
      "Separar tres casos: equipo funciona con adaptador pero no carga, funciona sólo con batería o no reconoce una de las fuentes. Registrar tensión del adaptador, tensión y estado reportado de batería, detección de adaptador y comportamiento con una batería conocida cuando sea seguro. Revisar conector, fusible, MOSFETs, controlador de carga y comunicación de batería según el esquema. Una batería agotada, bloqueada o degradada puede imitar una falla de placa; una lectura de software sola no confirma la causa.",
  },
  {
    id: "kb-no-image",
    title: "Equipo enciende pero no muestra imagen",
    tags: ["no-image", "display", "backlight", "external-display", "post"],
    content:
      "Confirmar primero señales reales de encendido: consumo, ventilador, LEDs, actividad de almacenamiento o respuesta de teclado. Probar monitor externo y linterna sobre el panel para separar video, panel y retroiluminación. Inspeccionar cable y conector con alimentación desconectada. Si tampoco hay imagen externa, revisar POST, memoria, reset, clocks, BIOS y fuentes de CPU/GPU. No concluir falla de GPU sólo por pantalla negra; documentar qué pruebas producen cambios.",
  },
  {
    id: "kb-bios-ec-basics",
    title: "Fundamentos de BIOS y Embedded Controller",
    tags: ["bios-ec", "bios", "ec", "firmware", "spi", "power-sequence"],
    content:
      "El EC participa en botón de encendido, detección de adaptador/batería y secuencias; la BIOS contiene firmware de arranque. Antes de atribuir la falla al firmware, confirmar alimentaciones de espera, reset, reloj y actividad del bus SPI cuando sea posible. Guardar un respaldo verificado antes de programar y usar una imagen exacta para placa y revisión. Una reprogramación exitosa no demuestra que BIOS fuera la causa. Registrar versión, origen del archivo y resultado de la prueba.",
  },
] as const;

type TagRule = {
  tag: string;
  patterns: readonly RegExp[];
};

const tagRules: readonly TagRule[] = [
  { tag: "no-power", patterns: [/\bno (?:enciende|prende)\b/, /\bsin encender\b/, /\bno power\b/, /\bmuert[oa]\b/] },
  { tag: "power-sequence", patterns: [/\bsecuencia (?:de )?(?:encendido|alimentacion)\b/, /\bpower sequence\b/, /\bno (?:enciende|prende)\b/] },
  { tag: "input-power", patterns: [/\bentrada (?:de )?(?:alimentacion|voltaje|tension)\b/, /\bdc[ -]?in\b/, /\b19(?:[.,]\d+)?\s*v\b/, /\b20(?:[.,]\d+)?\s*v\b/, /\bmosfet(?:s)? de entrada\b/, /\bno (?:enciende|prende)\b/] },
  { tag: "adapter", patterns: [/\badaptador\b/, /\bcargador\b/] },
  { tag: "dc-jack", patterns: [/\bjack\b/, /\bconector (?:dc|de carga|de alimentacion)\b/] },
  { tag: "input-mosfet", patterns: [/\bmosfet(?:s)? de entrada\b/, /\baco?k\b/] },
  { tag: "charger-ic", patterns: [/\bcharger\b/, /\bcontrolador de carga\b/, /\bic de carga\b/] },
  { tag: "standby-rails", patterns: [/\bstandby\b/, /\balways\b/, /\b3(?:[.,]3)?\s*v(?:alw)?\b/, /\b5\s*v(?:alw)?\b/, /\bno (?:enciende|prende)\b/] },
  { tag: "3valw", patterns: [/\b3(?:[.,]3)?\s*v(?:alw)?\b/, /\b3valw\b/] },
  { tag: "5valw", patterns: [/\b5\s*v(?:alw)?\b/, /\b5valw\b/] },
  { tag: "enable", patterns: [/\benable\b/, /\bhabilitacion\b/, /\benable\b/] },
  { tag: "buck-converter", patterns: [/\bbuck\b/, /\bconvertidor(?:es)? reductor(?:es)?\b/, /\bfuente pwm\b/] },
  { tag: "pwm", patterns: [/\bpwm\b/, /\bcontrolador (?:pwm|buck)\b/] },
  { tag: "mosfet", patterns: [/\bmosfet(?:s)?\b/] },
  { tag: "inductor", patterns: [/\bbobina(?:s)?\b/, /\binductor(?:es)?\b/] },
  { tag: "power-rail", patterns: [/\blinea de alimentacion\b/, /\briel\b/, /\bpower rail\b/, /\bbobina(?:s)?\b/] },
  { tag: "short-to-ground", patterns: [/\bcorto(?:circuito)?\b/, /\bcorto a tierra\b/, /\bshort(?: to ground)?\b/] },
  { tag: "low-resistance", patterns: [/\bresistencia (?:muy )?baja\b/, /\bresistencia a tierra\b/, /\b\d+(?:[.,]\d+)?\s*(?:ohm|Ω)\b/] },
  { tag: "current-injection", patterns: [/\binyeccion de (?:voltaje|tension|corriente)\b/, /\binyectar\b/, /\bfuente de laboratorio\b/] },
  { tag: "battery-charging", patterns: [/\bno carga\b/, /\bno esta cargando\b/, /\bcircuito de carga\b/, /\bcarga de bateria\b/] },
  { tag: "battery", patterns: [/\bbateria\b/] },
  { tag: "no-image", patterns: [/\bno da imagen\b/, /\bsin imagen\b/, /\bpantalla negra\b/, /\bno muestra imagen\b/] },
  { tag: "display", patterns: [/\bpantalla\b/, /\bdisplay\b/, /\bpanel (?:lcd|led)\b/] },
  { tag: "backlight", patterns: [/\bretroiluminacion\b/, /\bbacklight\b/, /\blinterna\b/] },
  { tag: "external-display", patterns: [/\bmonitor externo\b/, /\bpantalla externa\b/, /\bhdmi\b/, /\bdisplayport\b/] },
  { tag: "post", patterns: [/\bpost\b/, /\bcodigo(?:s)? de (?:error|parpadeo)\b/] },
  { tag: "bios-ec", patterns: [/\bbios\b/, /\bec\b/, /\bembedded controller\b/, /\bcontrolador embebido\b/] },
  { tag: "bios", patterns: [/\bbios\b/, /\bufi\b/] },
  { tag: "ec", patterns: [/\bec\b/, /\bembedded controller\b/, /\bcontrolador embebido\b/] },
  { tag: "firmware", patterns: [/\bfirmware\b/, /\breprogram(?:ar|acion)\b/] },
  { tag: "spi", patterns: [/\bspi\b/, /\bflash rom\b/] },
] as const;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function identifyKnowledgeTags(input: string): string[] {
  const normalized = normalizeSearchText(input);
  return tagRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(normalized)))
    .map((rule) => rule.tag);
}

export function retrieveKnowledgeDocuments(
  repair: Repair,
  events: readonly RepairEvent[],
  limit = 3,
): KnowledgeDocument[] {
  const safeLimit = Math.max(0, Math.min(3, Math.floor(limit)));
  if (safeLimit === 0) return [];

  const input = [
    repair.brand,
    repair.model,
    repair.reportedIssue,
    repair.diagnosis ?? "",
    ...events
      .filter((event) => event.type !== "AI_SUGGESTION")
      .map((event) => event.content),
  ].join("\n");
  const matchedTags = new Set(identifyKnowledgeTags(input));

  return knowledgeDocuments
    .map((document, index) => ({
      document,
      index,
      score: document.tags.filter((tag) => matchedTags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, safeLimit)
    .map(({ document }) => ({ ...document, tags: [...document.tags] }));
}

export function getKnowledgeDocument(id: string): KnowledgeDocument | undefined {
  return knowledgeDocuments.find((document) => document.id === id);
}
