# New Tab Blocks

Extensión Chrome Manifest V3, versión **1.0.0**, sin frameworks, backend ni dependencias de ejecución. Interfaz en español, accesos por colores y editor lateral con previsualización.

## Instalación y requisitos

1. Abre `chrome://extensions` y activa **Modo de desarrollador**.
2. Pulsa **Cargar descomprimida** y selecciona esta carpeta.
3. Abre una nueva pestaña. Después de actualizar el código, recarga la extensión.

Se requiere Chrome moderno con módulos JavaScript, diálogo modal, canvas y Web Locks. No hay compilación ni instalación de paquetes.

Para desarrollo sin extensión, ejecuta `python -m http.server 8765 --bind 127.0.0.1` y abre `http://localhost:8765/newtab.html`. Requiere Python 3 y un navegador moderno con Web Locks en un contexto seguro (localhost sirve). Cuando no existe Chrome Storage se utiliza localStorage. No abrir con `file://`.

## Uso

- El menú de personalización está en la esquina inferior izquierda; se abre con ratón, foco o toque.
- **Editar bloques** muestra las celdas para añadir. Selecciona un acceso para editarlo. Puedes eliminar desde el editor o desde la cruz del bloque.
- Arrastra entre celdas o enfoca un bloque y usa **Alt + flechas**. Un destino ocupado intercambia posiciones. También puedes introducir fila y columna en el editor.
- **Opciones** permite cambiar dimensiones, modo claro/oscuro, fondo y privacidad de favicons. Las imágenes locales muestran su nombre y pueden quitarse desde el panel.
- Los formularios previsualizan datos válidos. **Guardar cambios** persiste; **Cancelar**, cerrar o **Escape** restaura el estado guardado y devuelve el foco.
- Importar valida todo el archivo antes de mostrar un resumen y la previsualización. **Guardar cambios** aplica la sustitución; **Cancelar** la descarta. Durante esta revisión, los campos se desactivan: para editar, aplica primero o cancela.
- Exportar descarga la configuración actual o el borrador válido del editor. Los archivos incluyen imágenes locales comprimidas.
- Si hay un fallo de guardado se conserva el editor: vuelve a pulsar **Guardar cambios** para reintentar. Un fallo de lectura inicial bloquea escrituras: recarga para reintentar, sin sustituir datos corruptos.
- Si otra pestaña guarda mientras editas, se conserva tu borrador y se avisa. Expórtalo si lo necesitas y cancela para cargar los cambios remotos; un guardado obsoleto se rechaza.

## Arquitectura y datos

- `constants.js`: valores iniciales y límites.
- `model.js`: validación estricta, importación/exportación y movimiento con intercambio, sin acceso al DOM.
- `storage.js`: registro único `{revision, config}` en `chrome.storage.local`, lectura validada y guardado completo. Web Locks serializa lectura, comprobación de revisión y escritura entre pestañas del mismo origen. No se anuncia éxito antes de resolver la escritura. No hay fallback silencioso si falla Chrome Storage.
- `newtab.js`: estado persistido separado del borrador, eventos de interfaz y actualización de celdas por firma. La creación del bloque y de su botón de borrado está separada del recorrido de la cuadrícula.
- `utils.js`: contraste WCAG e imagen local reducida con canvas.
- `newtab.html`, `styles.css`, `fallback.svg`: interfaz, diseño e icono de respaldo local.
- `model.test.js`: pruebas del modelo y almacenamiento con adaptadores simulados.

Esquema de configuración:

```text
{
  version: 1,
  links: [{id, title, url, color, col, row, showTitle, showIcon}],
  settings: {
    theme, columns, rows, backgroundColor, backgroundImage,
    backgroundImageName?, showGridAlways, favicons
  }
}
```

`theme` acepta `light` o `dark`; si falta se interpreta como `light`. `backgroundImageName` es opcional, tiene hasta 255 caracteres y solo se conserva para imágenes locales. `showGridAlways` se mantiene en el formato, aunque el panel no ofrece un control para él.

Se rechazan versiones diferentes, tipos incorrectos, IDs y posiciones duplicados, colores distintos de `#RRGGBB` y protocolos distintos de HTTP/HTTPS. Se añade HTTPS a dominios sin protocolo. No se permiten credenciales en URLs. Los IDs se conservan en exportaciones.

Esta versión usa la clave `new-tab-blocks-v1`. Los datos del prototipo anterior permanecen intactos, pero no se migran automáticamente. Esta limpieza no cambia la clave ni el formato existentes al iniciarse la tarea.

## Límites

- 200 bloques; cuadrícula de hasta 12 columnas × 20 filas (máximo 240 celdas).
- Nombres de 1–40 caracteres; URL de hasta 2048; ID de 1–80 caracteres alfanuméricos, guiones o guiones bajos.
- JSON de hasta 3.000.000 bytes UTF-8.
- Imágenes locales PNG/JPEG/WebP de hasta 8.000.000 bytes y 40 megapíxeles; lado mayor de salida hasta 1920 px; data URL de salida hasta 700.000 caracteres. Se convierte a WebP con calidad decreciente y se rechaza si no cabe. El navegador debe poder decodificar el archivo; los límites de dimensiones se comprueban tras decodificarlo.
- Reducir la cuadrícula se rechaza si deja bloques fuera. Cambiar ventana o zoom conserva todas las posiciones y permite desplazamiento horizontal y vertical.

## Privacidad y seguridad

Único permiso: `storage`. Sin analítica, scripts remotos ni HTML construido desde datos del usuario. CSP Manifest V3 con scripts locales y objetos desactivados.

Los favicons externos están desactivados inicialmente; se muestra un icono local. Al permitirlos, Google recibe el dominio de los bloques con icono visible y la IP del navegador. Si un bloque oculta su favicon, no se crea una imagen ni se solicita su favicon. Las imágenes remotas de fondo contactan con su servidor, que puede registrar la IP. Las imágenes locales quedan en el almacenamiento local del perfil, sin subirlas a un servicio. Los JSON exportados contienen URLs e imágenes; no se cifran.

## Pruebas automatizadas

Ejecuta `node --test` o `npm test` con Node 20 o posterior, sin instalar paquetes. En PowerShell con scripts deshabilitados puede usarse `npm.cmd test`.

La suite contiene **11 pruebas**, todas superadas en esta revisión con Node 24.21.0: exportación/importación, protocolos, tipos y límites, archivos inválidos, movimiento/intercambio, fallos de escritura y lectura, revisiones obsoletas, guardados concurrentes, nombre de imagen local y modo claro/oscuro.

También se ha comprobado la sintaxis de todos los archivos JavaScript:

```powershell
Get-ChildItem *.js | ForEach-Object { node --check $_.FullName }
```

Estas pruebas no ejercitan el DOM, Chrome Storage real, Web Locks del navegador ni la compresión con canvas. La comparación estática del CSS verifica los valores finales por selector y contexto adaptable; no sustituye una comprobación visual.

## Flujos pendientes de verificar en Chrome

Se intentó abrir la interfaz local, pero el host de acceso al navegador no estaba disponible y el control nativo se detuvo al no poder verificar la URL activa. No se pudo completar la comprobación visual.

- Menú con ratón, teclado y toque; modo claro/oscuro, previsualización, cancelación y persistencia.
- Crear, editar, eliminar desde la cruz o el editor, cancelar y recargar; previsualizar fondo, imagen local válida y archivo corrupto.
- Arrastrar e intercambiar; mover con Alt + flechas; editar coordenadas en los bordes.
- Navegar solo con Tab/Enter/Escape; comprobar foco de retorno y anuncios con lector de pantalla. Verificar el comportamiento del diálogo modal nativo.
- Importar JSON válido/inválido, revisar resumen, cancelar/aplicar y exportar.
- Abrir dos pestañas: sincronización sin editor y aviso de conflicto con borrador. Comprobar rechazo del segundo guardado obsoleto.
- Simular cuota agotada: debe mostrar error y conservar la versión anterior y el borrador para reintentar.
- Zoom 200–400 %, ventana estrecha, panel largo y movimiento reducido del sistema.
- En red: cero peticiones de favicons por defecto o con icono oculto; respaldo local cuando falla un favicon.

## Comparación con la última versión registrada

Referencia: último commit local `2ec96e0` (manifiesto **0.1.0**). No se ha contrastado con una publicación de Chrome Web Store. Los cambios que ya estaban preparados al iniciar esta limpieza incluyen:

- Cuadrícula con dimensiones configurables y posiciones estables, interfaz de borde a borde, menú inferior y editor lateral modal; modo oscuro y borrado directo desde cada bloque.
- Validación centralizada del esquema, URLs, límites, identidades y posiciones; importación con revisión y previsualización antes de guardar, y exportación del borrador válido.
- Registro único con revisión, guardados serializados mediante Web Locks y detección de conflictos entre pestañas. Clave nueva sin migración automática del prototipo.
- Compresión de imágenes locales, conservación de su nombre, favicons externos opcionales, respaldo local, iconos de extensión y CSP explícita.
- Modelo independiente del DOM y suite de 11 pruebas sobre datos y persistencia.

Esta limpieza formatea JavaScript, HTML, CSS y JSON, separa funciones del renderizado y da nombres más explícitos a funciones y variables. El CSS reúne los estilos de cada componente y conserva los valores finales de las sobrescrituras, el modo oscuro, los estados de edición y las vistas adaptables. Se retiran reglas para elementos y estados ausentes tanto del HTML como de la creación dinámica desde JavaScript (`header`, `h1`, `h3`, `hr`, `#hint` y `.drop`). No se añaden dependencias de ejecución.

El estilo está definido en `.prettierrc.json`: dos espacios, comillas dobles, punto y coma y ancho objetivo de 80 columnas. Para repetir el formato puede usarse Prettier 3.9.10 como herramienta externa de desarrollo; no es requisito para ejecutar la extensión ni las pruebas.

## Mejoras pendientes y fallo detectado

La prioridad es verificar los flujos de Chrome enumerados arriba y, en otra tarea, automatizar pruebas del editor, cancelación, foco y sincronización entre pestañas. También convendría decidir una política explícita de migración desde la versión 0.1.0.

Fallo preexistente observado en el código, pendiente de reproducir en Chrome: durante la revisión de una importación se desactivan los campos, pero el botón **Quitar imagen de fondo** permanece habilitado. Su manejador puede modificar el borrador importado aunque los campos estén bloqueados. Se deja sin corregir porque es ajeno a esta limpieza.

Licencia MIT; consulta LICENSE.
