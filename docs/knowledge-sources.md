# Fuentes de la base técnica local

Los documentos de FixFlow son resúmenes operativos y conservadores para orientar
el próximo paso. No reemplazan el manual de servicio, esquema o documentación del
fabricante de cada equipo. Cada análisis recibe como máximo tres documentos.

## Persistencia y revisión

Los 20 documentos iniciales se preservan en D1 mediante la migración no
destructiva `0003_knowledge_documents.sql`. La sección **Knowledge** permite
buscar, filtrar por tag, crear, editar y eliminar documentos. Cada registro
conserva ID estable, tags, contenido, fuentes, estado y timestamps.

El estado `draft` permite revisión humana sin afectar análisis. El retrieval
considera exclusivamente documentos `published`, mantiene el orden determinista
por cantidad de tags coincidentes y limita la salida a tres documentos. Las
hipótesis `AI_SUGGESTION` no aportan evidencia al retrieval. Al eliminar una
fuente, los análisis previos conservan el ID citado dentro de su evento histórico.

## Arranque y reparación de Windows

- [Windows Startup Repair](https://support.microsoft.com/en-us/windows/experience/startup-boot/startup-repair)
- [Windows Recovery Environment](https://support.microsoft.com/en-us/windows/windows-recovery-environment-0eb14733-6301-41cb-8d26-06a12b42770b)
- [DISM y System File Checker](https://support.microsoft.com/en-us/windows/experience/backup-recovery/use-the-system-file-checker-tool-to-repair-missing-or-corrupted-system-files)
- [CHKDSK](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/chkdsk)
- [Resolución de pantallas azules](https://support.microsoft.com/en-us/windows/resolving-blue-screen-errors-in-windows-60b01860-58f2-be66-7516-5c45a66ae3c6)

## Almacenamiento y buses

- [Especificaciones oficiales de NVM Express](https://nvmexpress.org/specifications/)
- [USB Power Delivery, USB-IF](https://www.usb.org/document-library/usb-power-delivery)

## Temperatura y rendimiento

- [Intel: thermal throttling](https://www.intel.com/content/www/us/en/support/articles/000088048/processors.html)
- [Intel: overheating en laptops](https://www.intel.com/content/www/us/en/support/articles/000060293/processors.html)

## Periféricos

- [Microsoft: cámara no funciona en Windows](https://support.microsoft.com/en-US/Windows/Hardware/Camera/camera-doesn-t-work-in-windows)
- [Dell: diagnóstico de teclado y derrames](https://www.dell.com/support/contents/en-us/article/product-support/self-support-knowledgebase/mouse-keyboard-touchpad/laptop-keyboard-not-working)

Los documentos sobre secuencias de encendido, fuentes, convertidores y búsqueda
de cortos se mantienen deliberadamente generales. Siempre se debe confirmar el
nombre de las líneas, límites y procedimiento seguro en el esquema y manual de
servicio de la placa específica.
