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
  {
    id: "kb-storage-data-preservation",
    title: "Almacenamiento inestable y preservación de datos",
    tags: ["storage", "data-backup", "smart", "filesystem", "read-errors"],
    content:
      "Ante lentitud extrema, errores de lectura, desapariciones o ruidos anómalos, priorizar la copia de datos autorizada antes de pruebas intensivas. Registrar modelo, interfaz, detección en BIOS y sistema, estado SMART y errores observados. Un filesystem dañado puede ser consecuencia y no causa primaria. No ejecutar escrituras, reparaciones repetidas ni pruebas de superficie sobre una unidad con signos físicos de falla antes de acordar el riesgo sobre los datos.",
  },
  {
    id: "kb-hdd-mechanical-failure",
    title: "HDD con clics, silbidos o fallas mecánicas",
    tags: ["hdd", "mechanical-noise", "clicking", "storage", "data-backup"],
    content:
      "Clics repetitivos, intentos de giro o silbidos acompañados de lentitud y errores de lectura son señales de riesgo mecánico, pero el sonido por sí solo no identifica la pieza defectuosa. Evitar ciclos de encendido innecesarios y no abrir la unidad fuera de un entorno especializado. Confirmar si BIOS la detecta de forma estable y registrar comportamiento sin insistir. Si los datos son importantes, detener pruebas invasivas y escalar a recuperación profesional.",
  },
  {
    id: "kb-nvme-detection",
    title: "SSD y NVMe no detectados o intermitentes",
    tags: ["ssd", "nvme", "storage-detection", "bios-storage", "pcie-storage"],
    content:
      "Separar detección física en BIOS/UEFI de visibilidad dentro del sistema operativo. Apagar y desconectar antes de reinstalar el módulo; revisar fijación, conector y compatibilidad de interfaz. Probar en otro puerto o adaptador compatible cuando sea seguro. Una unidad visible en BIOS pero ausente en Windows orienta a particionado, controlador o configuración; una desaparición también en BIOS requiere priorizar conexión, firmware de plataforma, alimentación y la propia unidad.",
  },
  {
    id: "kb-memory-isolation",
    title: "Aislamiento de fallas de RAM y ranuras",
    tags: ["ram", "memory-test", "memory-module", "memory-slot", "post", "bsod"],
    content:
      "Para reinicios, congelamientos, errores variables o ausencia de POST tras ampliar memoria, volver primero a la configuración conocida. Probar cada módulo por separado y luego cada ranura, manteniendo constantes las demás variables. Registrar ciclos completados y errores; una prueba rápida aprobada no descarta una falla intermitente. Verificar compatibilidad, asentamiento y parámetros de memoria. No atribuir automáticamente todos los pantallazos azules a RAM sin aislar módulo y ranura.",
  },
  {
    id: "kb-windows-boot-recovery",
    title: "Windows no inicia y entorno WinRE",
    tags: ["windows-boot", "winre", "startup-repair", "boot-loop", "bcd", "update"],
    content:
      "Confirmar primero que BIOS detecte la unidad y conservar datos importantes. WinRE ofrece Reparación de inicio, desinstalación de actualizaciones, Restaurar sistema y opciones de arranque. Registrar qué herramienta se ejecutó y su resultado; repetir Reparación de inicio sin nueva evidencia aporta poco. Si BitLocker está activo, solicitar la clave legítima. Separar corrupción de arranque de una unidad inestable mediante diagnóstico de almacenamiento y eventos registrados.",
  },
  {
    id: "kb-windows-system-files",
    title: "Corrupción de archivos de sistema y filesystem",
    tags: ["windows-corruption", "dism", "sfc", "chkdsk", "filesystem", "slow-boot"],
    content:
      "DISM repara la imagen de Windows y SFC verifica archivos protegidos; registrar comandos y resultados completos. CHKDSK comprueba metadatos del filesystem, pero corregir errores implica escrituras y no sustituye un diagnóstico físico de la unidad. Antes de reparar, revisar salud del almacenamiento y respaldar datos cuando haya síntomas de hardware. Una corrupción reparable no demuestra por sí sola que el disco esté sano ni defectuoso.",
  },
  {
    id: "kb-thermal-throttling",
    title: "Temperatura alta, throttling y apagado térmico",
    tags: ["overheating", "thermal-throttling", "high-temperature", "shutdown-load", "performance-drop"],
    content:
      "Registrar temperatura, frecuencia, carga y tiempo hasta la caída de rendimiento o apagado. El throttling reduce frecuencia como protección y un apagado puede ocurrir si no alcanza para controlar la temperatura. Comparar con límites y comportamiento definidos por el OEM. No concluir pasta térmica seca sólo por una temperatura alta: comprobar ventiladores, flujo de aire, disipador, sensores, consumo y montaje antes de intervenir.",
  },
  {
    id: "kb-cooling-system",
    title: "Ventiladores, disipador y flujo de aire",
    tags: ["fan", "airflow", "dust", "cooling", "mechanical-noise", "overheating"],
    content:
      "Inspeccionar entradas y salidas de aire, acumulación de polvo y operación de cada ventilador. Comparar RPM o flujo entre lados cuando el equipo tenga más de uno. Un ruido de roce puede venir de aspas, rodamiento, cable u objeto suelto. Limpiar con el equipo sin energía y evitar hacer girar el ventilador a velocidad excesiva. Tras intervenir, repetir la misma carga y registrar temperatura, frecuencia y ruido.",
  },
  {
    id: "kb-usb-port-basics",
    title: "Puerto USB sin datos o alimentación",
    tags: ["usb", "usb-port", "vbus", "peripheral", "port-power"],
    content:
      "Probar el mismo periférico y cable en otro puerto y un periférico conocido en el puerto afectado. Separar ausencia de VBUS de falla de enumeración de datos. Inspeccionar pines y daño mecánico sin energizar. Si falta alimentación, medir VBUS y revisar protección, switch de carga y señales de habilitación según esquema. No puentear fusibles ni protecciones; un corto en el periférico también puede desactivar el puerto.",
  },
  {
    id: "kb-display-cable-hinge",
    title: "Parpadeo de pantalla al mover la tapa",
    tags: ["display-cable", "hinge", "flicker", "internal-display", "external-display"],
    content:
      "Si la imagen interna cambia al mover la tapa mientras el monitor externo permanece estable, registrar posiciones y reproducibilidad antes de desarmar. Con energía desconectada, inspeccionar cable eDP/LVDS, conectores, ruta por bisagras y puntos de pellizco. No asumir automáticamente panel o cable: una bisagra dañada, conector flojo o alimentación de backlight también puede producir intermitencia. Evitar flexionar repetidamente para no agravar el daño.",
  },
  {
    id: "kb-liquid-damage-input",
    title: "Teclado y entrada después de derrame",
    tags: ["liquid-damage", "keyboard", "touchpad", "corrosion", "input-device"],
    content:
      "Después de un derrame, apagar, desconectar cargador y batería cuando sea seguro y evitar nuevas pruebas energizadas hasta inspeccionar. Documentar líquido, tiempo transcurrido y si fue encendido después. Comparar teclado o mouse externo para separar dispositivo interno de sistema. Inspeccionar flex, conectores y residuos; la ausencia de daño exterior no descarta corrosión. No garantizar recuperación sin revisar la placa y los módulos afectados.",
  },
  {
    id: "kb-camera-detection",
    title: "Cámara no detectada en Windows",
    tags: ["camera", "privacy-shutter", "device-manager", "driver", "windows-update"],
    content:
      "Comprobar obturador o tecla física, permisos de privacidad y si la cámara aparece en Administrador de dispositivos. Probar la aplicación Cámara para separar un problema global de una aplicación concreta. Tras una actualización, revisar el controlador OEM y cambios de hardware; reinstalar o usar el controlador UVC genérico sólo cuando corresponda, porque puede perder funciones específicas. Si no aparece tampoco en firmware o diagnóstico OEM, investigar conexión y hardware.",
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
