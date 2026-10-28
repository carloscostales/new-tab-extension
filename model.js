import { LIMITS } from "./constants.js";
const fail = (message) => {
  throw new Error(message);
};
const isObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
export function url(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048)
    fail("URL vacía o demasiado larga (máximo 2048 caracteres).");
  let text = value.trim();
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) text = `https://${text}`;
  let result;
  try {
    result = new URL(text);
  } catch {
    fail("La URL no es válida.");
  }
  if (
    !["https:", "http:"].includes(result.protocol) ||
    !result.hostname ||
    result.username ||
    result.password
  )
    fail("Usa una URL HTTP o HTTPS sin credenciales.");
  return result.href;
}
function integer(value, max, label) {
  if (!Number.isInteger(value) || value < 1 || value > max)
    fail(`${label}: debe ser un entero entre 1 y ${max}.`);
  return value;
}
function bool(value) {
  if (typeof value !== "boolean")
    fail("Las opciones de visibilidad deben ser booleanas.");
  return value;
}
function color(value) {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value))
    fail("El color debe tener formato hexadecimal #RRGGBB.");
  return value;
}
export function validate(value) {
  if (!isObject(value) || value.version !== 1)
    fail("Versión de configuración incompatible (se requiere 1).");
  const settingsInput = value.settings;
  if (!isObject(settingsInput)) fail("Faltan las opciones de configuración.");
  const settings = {
    columns: integer(settingsInput.columns, LIMITS.columns, "Columnas"),
    rows: integer(settingsInput.rows, LIMITS.rows, "Filas"),
    tileSize: integer(settingsInput.tileSize === undefined ? 200 : settingsInput.tileSize, 400, "Tamaño de los cuadros"),
    backgroundColor: color(settingsInput.backgroundColor),
    showGridAlways: bool(settingsInput.showGridAlways),
    favicons: bool(settingsInput.favicons),
    backgroundImage: settingsInput.backgroundImage,
  };
  if (settings.tileSize < 120)
    fail("El tamaño de los cuadros debe ser de al menos 120 píxeles.");
  settings.theme =
    settingsInput.theme === undefined ? "light" : settingsInput.theme;
  if (!["light", "dark"].includes(settings.theme))
    fail("El modo debe ser claro u oscuro.");
  if (typeof settingsInput.backgroundImage !== "string")
    fail("La imagen de fondo debe ser texto.");
  if (settingsInput.backgroundImageName !== undefined) {
    if (
      typeof settingsInput.backgroundImageName !== "string" ||
      settingsInput.backgroundImageName.length > 255
    )
      fail("El nombre de la imagen debe ser texto de hasta 255 caracteres.");
    settings.backgroundImageName = settingsInput.backgroundImage.startsWith(
      "data:",
    )
      ? settingsInput.backgroundImageName
      : "";
  }
  if (settingsInput.backgroundImage) {
    if (settingsInput.backgroundImage.startsWith("data:")) {
      if (
        settingsInput.backgroundImage.length > LIMITS.storedImage ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          settingsInput.backgroundImage,
        )
      )
        fail("Imagen local inválida o demasiado grande.");
    } else settings.backgroundImage = url(settingsInput.backgroundImage);
  }
  if (!Array.isArray(value.links) || value.links.length > LIMITS.blocks)
    fail(`Se permiten hasta ${LIMITS.blocks} bloques.`);
  const ids = new Set(),
    positions = new Set();
  const links = value.links.map((block) => {
    if (
      !isObject(block) ||
      typeof block.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(block.id)
    )
      fail("Identificador de bloque inválido.");
    if (ids.has(block.id)) fail("Hay identificadores duplicados.");
    ids.add(block.id);
    if (
      typeof block.title !== "string" ||
      !block.title.trim() ||
      block.title.length > 40
    )
      fail("El nombre debe tener entre 1 y 40 caracteres.");
    const col = integer(block.col, settings.columns, "Columna"),
      row = integer(block.row, settings.rows, "Fila"),
      key = `${col}:${row}`;
    if (positions.has(key)) fail("Hay posiciones duplicadas.");
    positions.add(key);
    return {
      id: block.id,
      title: block.title.trim(),
      url: url(block.url),
      color: color(block.color),
      col,
      row,
      showTitle: bool(block.showTitle),
      showIcon: bool(block.showIcon),
    };
  });
  return { version: 1, links, settings };
}
export function parseImport(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > LIMITS.jsonBytes
  )
    fail("El JSON supera el límite de 3 MB.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail("El archivo no es JSON válido.");
  }
  return validate(data);
}
export const exportConfig = (config) =>
  JSON.stringify(validate(config), null, 2);
export function move(config, id, col, row) {
  const next = structuredClone(config),
    block = next.links.find((block) => block.id === id);
  if (!block) fail("No existe ese bloque.");
  const other = next.links.find(
    (block) => block.col === col && block.row === row && block.id !== id,
  );
  if (other) {
    other.col = block.col;
    other.row = block.row;
  }
  block.col = col;
  block.row = row;
  return validate(next);
}
