# Fuentes técnicas del seed de demostración

Los 36 casos de `migrations/0002_seed_demo_repairs.sql` son **sintéticos**:
los nombres, identificadores y cronologías no pertenecen a personas ni órdenes
reales. Los síntomas, pruebas y resoluciones fueron sintetizados a partir de la
documentación primaria/oficial indicada abajo. No se copió texto extenso.

## Energía, POST, imagen y batería

- [Dell — Resolve No Power, No POST, No Boot or No Video Issues](https://www.dell.com/support/kbdoc/en-us/000125609/resolve-no-power-no-post-no-boot-or-no-video-issues-with-your-dell-computer): respalda la separación entre no power, no POST, no boot y no video; descarga de energía, prueba con adaptador y diagnósticos preboot. Patrones usados en FF-2026-001, 003 y 006.
- [Dell — Troubleshoot Power Issues on a Dell Laptop](https://www.dell.com/support/kbdoc/en-us/000124389/how-to-troubleshoot-power-issues-on-a-dell-laptop): respalda LCD-BIST/M-BIST e investigación de placa cuando no hay encendido o imagen. Patrones usados en FF-2026-001 a 003.
- [Dell — Check Battery Health Status](https://www.dell.com/support/kbdoc/en-us/000124397/how-to-check-battery-health-status-on-dell-laptops): respalda comprobación de salud desde BIOS/diagnóstico y sustitución cuando la batería falla. Patrones usados en FF-2026-004 y 005.
- [Dell — Battery draining and swollen-battery guidance](https://www.dell.com/support/kbdoc/en-us/000143524/the-battery-drains-quicker-than-expected-on-a-dell-notebook-with-modern-standby-mode-enabled): documenta que un trackpad elevado puede indicar hinchado y aconseja dejar de usar/cargar el equipo. Patrón usado en FF-2026-034.

Los valores eléctricos de placa incluidos en mediciones son observaciones de
demo, no umbrales universales ni instrucciones de reparación para un modelo
concreto.

## HDD, SSD y NVMe

- [Dell — Resolve HDD or SSD Issues](https://www.dell.com/support/kbdoc/en-us/000179526/how-to-resolve-hdd-hard-drive-issues-on-your-dell-system): respalda síntomas como “No boot device”, errores de disco y uso de diagnóstico preboot. Patrones usados en FF-2026-007, 008 y 012.
- [Samsung Semiconductor — Internal SSD Troubleshooting](https://semiconductor.samsung.com/consumer-storage/support/faqs/internalssd-trouble-shooting/): respalda verificar conexión/ranura/BIOS, crear particiones cuando corresponda y revisar compatibilidad/controladores. Patrones usados en FF-2026-009 a 011.
- [Samsung Semiconductor — SSD firmware and software](https://semiconductor.samsung.com/consumer-storage/support/faqs/internalssd-fw-sw/): respalda firmware como factor de estabilidad y la recomendación de respaldar datos antes de actualizar. Patrones usados en FF-2026-010 a 012.
- [Samsung Semiconductor — Magician tools](https://semiconductor.samsung.com/consumer-storage/support/tools/): respalda pruebas SMART, revisión de temperatura/vida y actualizaciones de firmware según el modelo. Patrones usados en FF-2026-010 a 012.

## Memoria RAM

- [Crucial — Problems with your new memory](https://www.crucial.com/support/articles-faq-memory/problems-with-new-memory): respalda reinstalar módulos, probarlos individualmente y por ranura, y considerar incompatibilidad/firmware. Patrones usados en FF-2026-013 a 018.
- [Crucial — Memory installation troubleshooting](https://www.crucial.com/support/install-memory-troubleshooting): respalda que un módulo mal asentado o incompatible puede producir pantalla negra, no POST o memoria no reconocida. Patrones usados en FF-2026-014, 015 y 018.

## Windows, arranque, drivers y sistema de archivos

- [Microsoft — Startup Repair](https://support.microsoft.com/en-us/windows/experience/startup-boot/startup-repair): respalda usar WinRE para problemas de archivos del sistema, BCD, MBR, drivers o registro que impiden iniciar. Patrones usados en FF-2026-019 y 024.
- [Microsoft — Windows Recovery Environment](https://support.microsoft.com/en-us/windows/windows-recovery-environment-0eb14733-6301-41cb-8d26-06a12b42770b): respalda el acceso automático a WinRE tras arranques fallidos y sus herramientas de recuperación. Patrones usados en FF-2026-019 y 023.
- [Microsoft — DISM and System File Checker](https://support.microsoft.com/en-us/windows/experience/backup-recovery/use-the-system-file-checker-tool-to-repair-missing-or-corrupted-system-files): respalda diagnosticar/reparar componentes y archivos de sistema dañados. Patrón usado en FF-2026-020.
- [Microsoft — Troubleshooting blank screens](https://support.microsoft.com/en-US/Windows/Hardware/Display-Graphics/troubleshooting-blank-screens-in-windows): respalda usar modo seguro/recuperación para aislar pantallas negras posteriores al inicio. Patrón usado en FF-2026-021.
- [Microsoft — Perform a clean boot](https://support.microsoft.com/en-us/windows/experience/startup-boot/how-to-perform-a-clean-boot-in-windows): respalda iniciar solo con controladores y programas esenciales para aislar conflictos. Patrón usado en FF-2026-022.
- [Microsoft — Find your BitLocker recovery key](https://support.microsoft.com/en-us/windows/finding-your-bitlocker-recovery-key-in-windows-6b71ad27-0b89-ea08-f143-056f5ab347d6): respalda que la clave de 48 dígitos es necesaria y no puede recrearse por soporte. Patrón usado en FF-2026-023.

## Temperatura y periféricos

- [Intel — What Is Throttling and How Can It Be Resolved?](https://www.intel.com/content/www/us/en/support/articles/000088048/processors.html): respalda reducción de frecuencia al alcanzar el límite térmico como mecanismo de protección. Patrones usados en FF-2026-025 a 030.
- [Intel — My Laptop Seems to Be Overheating](https://www.intel.com/content/www/us/en/support/articles/000060293/processors.html): respalda que la protección térmica puede reducir velocidad y finalmente apagar el procesador. Patrones usados en FF-2026-025, 026 y 028.
- [Microsoft — Camera doesn't work in Windows](https://support.microsoft.com/en-US/Windows/Hardware/Camera/camera-doesn-t-work-in-windows): respalda revisar obturador, permisos, detección, controlador y prueba en otra aplicación antes de concluir daño físico. Patrón usado en FF-2026-033.
- [Dell — How to Fix USB Port Issues](https://www.dell.com/support/kbdoc/en-us/000132048/how-to-troubleshoot-usb-issues): respalda inspeccionar puertos/cables, probar el dispositivo y otros puertos, revisar BIOS/controladores y ejecutar diagnóstico antes de atribuir la causa al hardware. Patrones usados en FF-2026-032 y 036.
- [Dell — How to Test Your Laptop Screen](https://www.dell.com/support/kbdoc/en-us/000134936/how-to-run-the-lcd-built-in-self-test-on-a-dell-laptop): respalda aislar parpadeo, líneas e imagen inestable con LCD-BIST y diferenciar panel de GPU/configuración. Patrón usado en FF-2026-035.
- [Dell — Examples of accidental damage](https://www.dell.com/support/kbdoc/en-us/000332239/types-of-damages-not-covered-by-dell-basic-support): documenta derrame sobre teclado y daños físicos de pantalla/puertos como patrones reales de ingreso a servicio. Patrón de recepción usado en FF-2026-031.

En todos los casos de periféricos la causa se declara solo cuando una inspección
o prueba cruzada la confirma. El seed no sustituye el manual de servicio
específico de cada modelo.

## Infraestructura y pruebas

- [Cloudflare — D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/): flujo local de D1 mediante Wrangler.
- [Cloudflare — D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/): archivos SQL ordenados y aplicación local/remota de migraciones.
- [Cloudflare — Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/): entorno recomendado para probar bindings en el runtime Workers.
- [Cloudflare — Vitest D1 APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/): `readD1Migrations`/`applyD1Migrations` usados por las pruebas de persistencia.
