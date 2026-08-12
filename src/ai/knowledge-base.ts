import type {
  KnowledgeDocument,
  Repair,
  RepairEvent,
} from "../domain/schemas";


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
  { tag: "storage", patterns: [/\balmacenamiento\b/, /\bdisco\b/, /\bunidad\b/, /\bhdd\b/, /\bssd\b/, /\bnvme\b/] },
  { tag: "data-backup", patterns: [/\bcopia (?:de )?datos\b/, /\bbackup\b/, /\brespald(?:o|ar)\b/, /\bdatos que (?:conservar|recuperar)\b/] },
  { tag: "smart", patterns: [/\bsmart\b/, /\berrores? de medio\b/] },
  { tag: "filesystem", patterns: [/\bfilesystem\b/, /\bsistema de archivos\b/, /\barchivos dañados\b/, /\bchkdsk\b/] },
  { tag: "read-errors", patterns: [/\berrores? de lectura\b/, /\bno (?:encuentra|abre) (?:el sistema|archivos)\b/] },
  { tag: "hdd", patterns: [/\bhdd\b/, /\bdisco (?:duro|rigido)\b/] },
  { tag: "mechanical-noise", patterns: [/\bclic(?:s|keo)?\b/, /\bclacs?\b/, /\bsilbido(?:s)?\b/, /\bruido de roce\b/] },
  { tag: "clicking", patterns: [/\bclic(?:s|keo)?\b/, /\bclacs?\b/] },
  { tag: "ssd", patterns: [/\bssd\b/, /\bunidad de estado solido\b/] },
  { tag: "nvme", patterns: [/\bnvme\b/, /\bm\.2\b/] },
  { tag: "storage-detection", patterns: [/\bno (?:figura|aparece|detecta|reconoce)\b[^.]{0,40}\b(?:ssd|nvme|disco|unidad)\b/, /\b(?:ssd|nvme|disco|unidad)\b[^.]{0,40}\bno (?:figura|aparece|detecta|reconoce)\b/] },
  { tag: "bios-storage", patterns: [/\b(?:ssd|nvme|disco|unidad)\b[^.]{0,40}\bbios\b/, /\bbios\b[^.]{0,40}\b(?:ssd|nvme|disco|unidad)\b/, /\bno bootable device\b/] },
  { tag: "pcie-storage", patterns: [/\bpcie\b/, /\bnvme\b/] },
  { tag: "ram", patterns: [/\bram\b/, /\bmemoria\b/, /\bmodulo(?:s)?\b[^.]{0,20}\bmemoria\b/] },
  { tag: "memory-test", patterns: [/\bprueba (?:de )?memoria\b/, /\bdiagnostico (?:de )?memoria\b/, /\bciclos? de memoria\b/] },
  { tag: "memory-module", patterns: [/\bmodulo(?:s)?\b/, /\bampli(?:ar|acion) (?:de )?(?:ram|memoria)\b/] },
  { tag: "memory-slot", patterns: [/\branura(?:s)?\b/, /\bslot(?:s)?\b/] },
  { tag: "bsod", patterns: [/\bpantalla azul\b/, /\bbsod\b/, /\berrores? diferentes\b/] },
  { tag: "windows-boot", patterns: [/\bwindows no inicia\b/, /\bno inicia windows\b/, /\breparacion automatica\b/, /\bwinre\b/, /\binaccessible_boot_device\b/] },
  { tag: "winre", patterns: [/\bwinre\b/, /\breparacion automatica\b/, /\bentorno de recuperacion\b/] },
  { tag: "startup-repair", patterns: [/\breparacion de inicio\b/, /\bstartup repair\b/] },
  { tag: "boot-loop", patterns: [/\bbucle (?:de )?(?:arranque|inicio)\b/, /\bentra siempre en reparacion automatica\b/] },
  { tag: "bcd", patterns: [/\bbcd\b/, /\bconfiguracion de arranque\b/] },
  { tag: "windows-corruption", patterns: [/\bcorrupcion\b/, /\barchivos dañados\b/, /\bdism\b/, /\bsfc\b/] },
  { tag: "dism", patterns: [/\bdism\b/] },
  { tag: "sfc", patterns: [/\bsfc\b/, /\bscannow\b/] },
  { tag: "chkdsk", patterns: [/\bchkdsk\b/, /\brevisa (?:el )?disco\b/] },
  { tag: "slow-boot", patterns: [/\binicia (?:muy )?lento\b/, /\barranque lento\b/] },
  { tag: "overheating", patterns: [/\bse calienta\b/, /\bmuy caliente\b/, /\btemperatura\b/, /\b(?:9[5-9]|100)\s*°?c\b/] },
  { tag: "thermal-throttling", patterns: [/\bthrottling\b/, /\blimite termico\b/, /\breduce frecuencia\b/, /\bbaja (?:de )?rendimiento\b/] },
  { tag: "high-temperature", patterns: [/\b(?:9[5-9]|100)\s*°?c\b/, /\btemperatura alta\b/] },
  { tag: "shutdown-load", patterns: [/\bse apaga\b[^.]{0,35}\b(?:jugar|carga|render)\b/, /\bapagado\b[^.]{0,35}\bcarga\b/] },
  { tag: "performance-drop", patterns: [/\bbaja (?:de )?rendimiento\b/, /\breduce frecuencia\b/, /\bse vuelve (?:muy )?lenta\b/] },
  { tag: "fan", patterns: [/\bventilador(?:es)?\b/] },
  { tag: "airflow", patterns: [/\bflujo de aire\b/, /\bsale aire\b/] },
  { tag: "dust", patterns: [/\bpolvo\b/] },
  { tag: "cooling", patterns: [/\brefrigeracion\b/, /\bdisipador\b/, /\bventilador(?:es)?\b/] },
  { tag: "usb", patterns: [/\busb(?:-c)?\b/] },
  { tag: "usb-port", patterns: [/\bpuerto usb\b/, /\busb\b[^.]{0,20}\bpuerto\b/] },
  { tag: "vbus", patterns: [/\bvbus\b/, /\bpuerto\b[^.]{0,25}\bno entrega 5\s*v\b/] },
  { tag: "peripheral", patterns: [/\bmouse\b/, /\bteclado externo\b/, /\bperiferico\b/] },
  { tag: "port-power", patterns: [/\bpuerto\b[^.]{0,25}\b(?:5\s*v|alimentacion)\b/] },
  { tag: "display-cable", patterns: [/\bcable (?:de )?(?:pantalla|display|edp|lvds)\b/, /\bflex (?:de )?(?:pantalla|display)\b/] },
  { tag: "hinge", patterns: [/\bbisagra\b/, /\bmover (?:la )?(?:tapa|pantalla)\b/, /\babrir[^.]{0,15}cerrar (?:la )?tapa\b/] },
  { tag: "flicker", patterns: [/\bparpadea\b/, /\bparpadeo\b/, /\bdestella\b/] },
  { tag: "internal-display", patterns: [/\bpantalla interna\b/, /\bmover (?:la )?tapa\b/] },
  { tag: "liquid-damage", patterns: [/\bderram(?:e|o|ar)\b/, /\bagua\b/, /\bliquido\b/] },
  { tag: "keyboard", patterns: [/\bteclado\b/, /\bteclas\b/] },
  { tag: "touchpad", patterns: [/\btouchpad\b/, /\btrackpad\b/] },
  { tag: "corrosion", patterns: [/\bcorrosion\b/, /\bresiduos\b/] },
  { tag: "input-device", patterns: [/\bteclado\b/, /\btouchpad\b/, /\bmouse\b/] },
  { tag: "camera", patterns: [/\bcamara\b/, /\bwebcam\b/] },
  { tag: "privacy-shutter", patterns: [/\bobturador\b/, /\bprivacidad\b[^.]{0,20}\bcamara\b/] },
  { tag: "device-manager", patterns: [/\badministrador de dispositivos\b/] },
  { tag: "driver", patterns: [/\bcontrolador(?:es)?\b/, /\bdriver(?:s)?\b/] },
  { tag: "windows-update", patterns: [/\bactualizacion (?:de )?windows\b/, /\bwindows update\b/] },
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
  documents: readonly KnowledgeDocument[],
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

  return documents
    .filter((document) => document.status === "published")
    .map((document) => ({
      document,
      score: document.tags.filter((tag) => matchedTags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) =>
      right.score - left.score || left.document.id.localeCompare(right.document.id),
    )
    .slice(0, safeLimit)
    .map(({ document }) => ({ ...document, tags: [...document.tags] }));
}
