import { defaults, LIMITS } from "./constants.js";
import { validate, move, parseImport, exportConfig } from "./model.js";
import { store, subscribe } from "./storage.js";
import { textColor, compressImage } from "./utils.js";
const getElement = (id) => document.getElementById(id);
const form = getElement("form");
const fields = form.elements;
const grid = getElement("blocks");
const dialog = getElement("editor");
let current = { revision: 0, config: defaults() };
let draft = null;
let mode = "";
let activeId = "";
let editing = false;
let opener = null;
let dragId = "";
let busy = false;
let imageToken = 0;
let imagePending = false;
let openerId = "";
let openerPosition = null;
let imported = false;
let loadFailed = false;
const cells = new Map();
let statusTimer;
function announce(message) {
  clearTimeout(statusTimer);
  getElement("status").textContent = message;
  statusTimer = setTimeout(() => {
    getElement("status").textContent = "";
  }, 5000);
}
function showError(e) {
  getElement("error").textContent = e.message;
}
function syncThemeToggle(theme) {
  const dark = theme === "dark";
  getElement("theme-toggle").setAttribute("aria-pressed", String(dark));
  getElement("theme-toggle").setAttribute(
    "aria-label",
    dark ? "Activar modo claro" : "Activar modo oscuro",
  );
  getElement("theme-toggle").title = dark
    ? "Modo oscuro · cambiar a claro"
    : "Modo claro · cambiar a oscuro";
}
function showImageName(settings) {
  const label = getElement("background-image-name");
  getElement("background-image-info").hidden = !settings.backgroundImage;
  if (!settings.backgroundImage) {
    label.textContent = "";
    return;
  }
  let name =
    settings.backgroundImageName ||
    "Imagen local guardada (nombre no disponible)";
  if (!settings.backgroundImage.startsWith("data:")) {
    const imageUrl = new URL(settings.backgroundImage);
    name =
      imageUrl.pathname.split("/").filter(Boolean).pop() || imageUrl.hostname;
    try {
      name = decodeURIComponent(name);
    } catch {
      /* Conserva el nombre si contiene escapes inválidos. */
    }
  }
  label.textContent = `Imagen de fondo: ${name}`;
}
function createTile(block, settings, col, row) {
  const tile = document.createElement("a");
  tile.className = "tile";
  tile.href = block.url;
  tile.dataset.id = block.id;
  tile.draggable = editing;
  tile.setAttribute(
    "aria-label",
    editing
      ? `Editar ${block.title}, columna ${col}, fila ${row}`
      : block.title,
  );
  tile.style.background = block.color;
  tile.style.color = textColor(block.color);
  if (block.showIcon) {
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    const domain = encodeURIComponent(new URL(block.url).hostname);
    img.src = settings.favicons
      ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
      : "fallback.svg";
    img.addEventListener("error", () => {
      if (!img.src.endsWith("/fallback.svg")) img.src = "fallback.svg";
    });
    tile.append(img);
  }
  if (block.showTitle) {
    const span = document.createElement("span");
    span.textContent = block.title;
    tile.append(span);
  }
  return tile;
}

function createDeleteButton(block, cell) {
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "tile-delete";
  remove.style.color = textColor(block.color);
  remove.textContent = "×";
  remove.title = `Eliminar ${block.title}`;
  remove.setAttribute("aria-label", `Eliminar bloque ${block.title}`);
  remove.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    runGuarded(async () => {
      remove.disabled = true;
      try {
        const next = structuredClone(current.config);
        next.links = next.links.filter((link) => link.id !== block.id);
        await persistConfig(next);
        announce("Bloque eliminado.");
        cell.querySelector(".add")?.focus();
      } finally {
        if (remove.isConnected) remove.disabled = false;
      }
    });
  });
  return remove;
}

function renderConfig(config = current.config) {
  showImageName(config.settings);
  const settings = config.settings;
  document.documentElement.dataset.theme = settings.theme || "light";
  syncThemeToggle(settings.theme);
  document.body.style.backgroundColor =
    settings.theme === "dark" && settings.backgroundColor === "#eef1f4"
      ? "#121212"
      : settings.backgroundColor;
  document.body.style.backgroundImage = settings.backgroundImage
    ? `url(${JSON.stringify(settings.backgroundImage)})`
    : "";
  grid.style.setProperty("--columns", settings.columns);
  grid.style.setProperty("--tile-size", `${settings.tileSize}px`);
  grid.classList.toggle("editing", editing);
  const occupied = new Map(
      config.links.map((block) => [`${block.col}:${block.row}`, block]),
    ),
    keys = new Set();
  for (let row = 1; row <= settings.rows; row++)
    for (let col = 1; col <= settings.columns; col++) {
      const key = `${col}:${row}`;
      keys.add(key);
      let cell = cells.get(key);
      if (!cell) {
        cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.col = col;
        cell.dataset.row = row;
        cells.set(key, cell);
        grid.append(cell);
      }
      cell.style.gridColumn = col;
      cell.style.gridRow = row;
      const block = occupied.get(key),
        signature = JSON.stringify([
          block,
          editing,
          settings.showGridAlways,
          settings.favicons,
        ]);
      if (cell.dataset.signature === signature) continue;
      cell.dataset.signature = signature;
      cell.replaceChildren();
      cell.className = "cell";
      if (block) {
        cell.append(createTile(block, settings, col, row));
        if (editing) {
          cell.append(createDeleteButton(block, cell));
        }
      } else if (editing) {
        cell.classList.add("empty");
        const button = document.createElement("button");
        button.className = "add";
        button.textContent = "+";
        button.setAttribute(
          "aria-label",
          `Añadir bloque, columna ${col}, fila ${row}`,
        );
        cell.append(button);
      }
    }
  for (const [key, cell] of cells)
    if (!keys.has(key)) {
      cell.remove();
      cells.delete(key);
    }
}
function closeEditor() {
  if (busy) return;
  imageToken++;
  imagePending = false;
  getElement("save").disabled = false;
  dialog.close();
  getElement("options").setAttribute("aria-expanded", "false");
  draft = null;
  renderConfig();
  const replacement = openerId
    ? grid.querySelector(`[data-id="${openerId}"]`)
    : openerPosition
      ? cells
          .get(`${openerPosition.col}:${openerPosition.row}`)
          ?.querySelector("button")
      : null;
  (opener?.isConnected
    ? opener
    : replacement || getElement("menu-toggle")
  ).focus();
}
function openEditor(kind, block = null, col = 1, row = 1) {
  opener = document.activeElement;
  openerId = opener?.dataset.id || "";
  openerPosition = opener?.closest(".cell")?.dataset;
  draft = structuredClone(current.config);
  mode = kind;
  activeId = block?.id || crypto.randomUUID();
  imported = false;
  form.reset();
  getElement("error").textContent = "";
  getElement("conflict").hidden = true;
  getElement("import-summary").hidden = true;
  getElement("block-fields").hidden = kind !== "block";
  getElement("settings-fields").hidden = kind !== "settings";
  getElement("import").hidden = kind !== "settings";
  getElement("delete").hidden = !block;
  getElement("panel-title").textContent =
    kind === "settings" ? "Opciones" : block ? "Editar bloque" : "Nuevo bloque";
  if (kind === "block") {
    const blockValues = block || {
      title: "",
      url: "",
      color: "#426b60",
      col,
      row,
      showTitle: true,
      showIcon: true,
    };
    for (const fieldName of ["title", "url", "color", "col", "row"])
      fields[fieldName].value = blockValues[fieldName];
    for (const fieldName of ["showTitle", "showIcon"])
      fields[fieldName].checked = blockValues[fieldName];
  } else fillSettingsForm();
  dialog.showModal();
  getElement("options").setAttribute(
    "aria-expanded",
    String(kind === "settings"),
  );
  (kind === "block" ? fields.title : fields.columns).focus();
}
function fillSettingsForm() {
  const settings = draft.settings;
  for (const fieldName of ["columns", "rows", "tileSize", "backgroundColor"])
    fields[fieldName].value = settings[fieldName];
  fields.theme.value = settings.theme || "light";
  syncThemeToggle(fields.theme.value);
  getElement("theme-toggle").disabled = false;
  fields.backgroundImage.value = settings.backgroundImage.startsWith("data:")
    ? ""
    : settings.backgroundImage;
  fields.favicons.checked = settings.favicons;
  getElement("image").value = "";
  showImageName(settings);
}
function collectDraft() {
  if (imported) return validate(draft);
  let next = structuredClone(draft);
  if (mode === "settings") {
    next.settings = {
      ...next.settings,
      theme: fields.theme.value,
      columns: Number(fields.columns.value),
      rows: Number(fields.rows.value),
      tileSize: Number(fields.tileSize.value),
      backgroundColor: fields.backgroundColor.value,
      showGridAlways: false,
      favicons: fields.favicons.checked,
      backgroundImage:
        fields.backgroundImage.value.trim() ||
        (next.settings.backgroundImage.startsWith("data:")
          ? next.settings.backgroundImage
          : ""),
    };
  } else {
    const col = Number(fields.col.value),
      row = Number(fields.row.value),
      old = next.links.find((block) => block.id === activeId);
    if (old) next = move(next, activeId, col, row);
    else if (next.links.some((block) => block.col === col && block.row === row))
      throw new Error(
        "Esta celda está ocupada. Elige otra para el nuevo bloque.",
      );
    const block = {
      id: activeId,
      title: fields.title.value,
      url: fields.url.value,
      color: fields.color.value,
      col,
      row,
      showTitle: fields.showTitle.checked,
      showIcon: fields.showIcon.checked,
    };
    next.links = next.links.filter((block) => block.id !== activeId);
    next.links.push(block);
  }
  return validate(next);
}
async function persistConfig(config) {
  if (loadFailed)
    throw new Error(
      "No se pudo leer el almacenamiento. Recarga la página antes de guardar para proteger los datos existentes.",
    );
  current = await store.save(config, current.revision);
  renderConfig();
  announce("Cambios guardados.");
}
async function runGuarded(task) {
  if (busy) return;
  if (imagePending) {
    showError(new Error("Espera a que termine de procesarse la imagen."));
    return;
  }
  busy = true;
  for (const button of dialog.querySelectorAll("button"))
    button.disabled = true;
  form.inert = true;
  try {
    await task();
  } catch (e) {
    showError(e);
    announce(e.message);
  } finally {
    busy = false;
    form.inert = false;
    for (const button of dialog.querySelectorAll("button"))
      button.disabled = false;
  }
}
let menuCloseTimer;
function setMenu(open, restoreFocus = false) {
  clearTimeout(menuCloseTimer);
  if (restoreFocus) getElement("menu-toggle").focus();
  getElement("menu-panel").hidden = !open;
  getElement("menu-toggle").setAttribute("aria-expanded", String(open));
  getElement("menu-toggle").setAttribute(
    "aria-label",
    open ? "Cerrar menú de personalización" : "Abrir menú de personalización",
  );
}
getElement("page-menu").addEventListener("pointerenter", (e) => {
  if (e.pointerType === "mouse") setMenu(true);
});
getElement("page-menu").addEventListener("pointerleave", (e) => {
  if (
    e.pointerType === "mouse" &&
    !getElement("page-menu").contains(document.activeElement)
  ) {
    menuCloseTimer = setTimeout(() => {
      if (
        !getElement("page-menu").matches(":hover") &&
        !getElement("page-menu").contains(document.activeElement)
      )
        setMenu(false);
    }, 200);
  }
});
getElement("menu-toggle").addEventListener("focus", () => setMenu(true));
// En pantallas táctiles no existe hover; el toque conserva el acceso al menú.
getElement("menu-toggle").onclick = (e) => {
  if (e.detail === 0 || matchMedia("(hover: none)").matches) setMenu(true);
};
getElement("theme-toggle").onclick = () => {
  if (imported) return;
  fields.theme.value = fields.theme.value === "dark" ? "light" : "dark";
  syncThemeToggle(fields.theme.value);
  form.dispatchEvent(new Event("input", { bubbles: true }));
};
getElement("page-menu").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !getElement("menu-panel").hidden) {
    e.preventDefault();
    setMenu(false, true);
  }
  if (e.target === getElement("menu-toggle") && e.key === "ArrowUp") {
    e.preventDefault();
    setMenu(true);
    getElement("edit").focus();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!getElement("page-menu").contains(e.target)) setMenu(false);
});
getElement("page-menu").addEventListener("focusout", (e) => {
  if (!getElement("page-menu").contains(e.relatedTarget)) setMenu(false);
});
getElement("edit").onclick = () => {
  editing = !editing;
  getElement("edit").setAttribute("aria-pressed", String(editing));
  getElement("edit").textContent = editing
    ? "Terminar edición"
    : "Editar bloques";
  getElement("menu-toggle").classList.toggle("is-editing", editing);
  getElement("menu-toggle").title = editing
    ? "Personalizar · edición activa"
    : "Personalizar";
  setMenu(false, true);
  renderConfig();
};
getElement("options").onclick = () => {
  setMenu(false, true);
  openEditor("settings");
};
getElement("close").onclick = closeEditor;
getElement("cancel").onclick = closeEditor;
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
form.addEventListener("input", () => {
  if (imported) return;
  try {
    renderConfig(collectDraft());
    getElement("error").textContent = "";
  } catch (e) {
    showError(e);
  }
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  runGuarded(async () => {
    await persistConfig(collectDraft());
    busy = false;
    closeEditor();
  });
});
getElement("delete").onclick = () =>
  runGuarded(async () => {
    const next = structuredClone(draft);
    next.links = next.links.filter((block) => block.id !== activeId);
    await persistConfig(next);
    busy = false;
    closeEditor();
  });
grid.addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell || !editing) return;
  e.preventDefault();
  const id = e.target.closest("[data-id]")?.dataset.id;
  openEditor(
    "block",
    current.config.links.find((block) => block.id === id),
    Number(cell.dataset.col),
    Number(cell.dataset.row),
  );
});
async function relocateBlock(id, col, row) {
  if (busy) return;
  busy = true;
  try {
    await persistConfig(move(current.config, id, col, row));
    grid.querySelector(`[data-id="${id}"]`)?.focus();
  } catch (e) {
    announce(e.message);
  } finally {
    busy = false;
  }
}
function movementDelta(e) {
  if (!e.altKey) return null;
  return {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[e.key];
}
dialog.addEventListener("keydown", (e) => {
  if (mode !== "block" || busy) return;
  const delta = movementDelta(e);
  if (!delta) return;
  e.preventDefault();
  const col = Number(fields.col.value) + delta[0];
  const row = Number(fields.row.value) + delta[1];
  if (
    !Number.isInteger(col) || !Number.isInteger(row) ||
    col < 1 || col > draft.settings.columns ||
    row < 1 || row > draft.settings.rows
  ) return;
  fields.col.value = col;
  fields.row.value = row;
  fields.col.dispatchEvent(new Event("input", { bubbles: true }));
});
grid.addEventListener("keydown", (e) => {
  const id = e.target.closest("[data-id]")?.dataset.id;
  if (!editing || !id || !e.altKey) return;
  const delta = movementDelta(e);
  if (!delta) return;
  e.preventDefault();
  const block = current.config.links.find((block) => block.id === id);
  relocateBlock(id, block.col + delta[0], block.row + delta[1]);
});
grid.addEventListener("dragstart", (e) => {
  if (!editing) return;
  dragId = e.target.closest("[data-id]")?.dataset.id || "";
  if (dragId) e.dataTransfer.setData("text/plain", dragId);
});
grid.addEventListener("dragover", (e) => {
  if (dragId && e.target.closest(".cell")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
});
grid.addEventListener("drop", (e) => {
  e.preventDefault();
  const cell = e.target.closest(".cell");
  if (dragId && cell)
    relocateBlock(dragId, Number(cell.dataset.col), Number(cell.dataset.row));
  dragId = "";
});
grid.addEventListener("dragend", () => {
  dragId = "";
});
getElement("image").onchange = async () => {
  const token = ++imageToken;
  const file = getElement("image").files[0];
  if (!file) return;
  imagePending = true;
  getElement("save").disabled = true;
  try {
    const data = await compressImage(file);
    if (token !== imageToken || !draft) return;
    draft.settings.backgroundImage = data;
    draft.settings.backgroundImageName = file.name.slice(0, 255);
    fields.backgroundImage.value = "";
    renderConfig(collectDraft());
    getElement("error").textContent = "";
  } catch (e) {
    if (token === imageToken) showError(e);
  } finally {
    if (token === imageToken) {
      imagePending = false;
      getElement("save").disabled = false;
    }
  }
};
getElement("clear-image").onclick = () => {
  imageToken++;
  imagePending = false;
  draft.settings.backgroundImage = "";
  draft.settings.backgroundImageName = "";
  fields.backgroundImage.value = "";
  getElement("image").value = "";
  getElement("save").disabled = false;
  try {
    renderConfig(collectDraft());
  } catch (e) {
    showError(e);
  }
};
getElement("export").onclick = () => {
  try {
    const data = draft ? collectDraft() : current.config;
    const blob = new Blob([exportConfig(data)], { type: "application/json" }),
      u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = "new-tab-blocks.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    announce("Configuración exportada.");
  } catch (e) {
    showError(e);
  }
};
getElement("import").onclick = () => getElement("import-file").click();
getElement("import-file").onchange = async () => {
  const file = getElement("import-file").files[0];
  if (!file) return;
  try {
    if (file.size > LIMITS.jsonBytes)
      throw new Error("El archivo supera los 3 MB.");
    const next = parseImport(await file.text());
    if (!draft || !dialog.open) return;
    imageToken++;
    imagePending = false;
    getElement("save").disabled = false;
    draft = next;
    imported = true;
    fillSettingsForm();
    getElement("theme-toggle").disabled = true;
    getElement("import-summary").hidden = false;
    getElement("import-summary").textContent =
      `Revisar importación: ${next.links.length} bloques; ` +
      `${next.settings.columns} columnas × ${next.settings.rows} filas. ` +
      "Guardar sustituirá toda la configuración.";
    getElement("settings-fields")
      .querySelectorAll("input:not([type=file]),select")
      .forEach((input) => (input.disabled = true));
    renderConfig(draft);
    getElement("error").textContent = "";
  } catch (e) {
    showError(e);
  } finally {
    getElement("import-file").value = "";
  }
};
dialog.addEventListener("close", () => {
  getElement("settings-fields")
    .querySelectorAll("input,select")
    .forEach((input) => (input.disabled = false));
});
subscribe(async () => {
  try {
    const latest = await store.read();
    if (latest.revision === current.revision) return;
    if (draft) {
      getElement("conflict").hidden = false;
      announce("Otra pestaña ha guardado cambios. Tu borrador se conserva.");
    } else {
      current = latest;
      renderConfig();
      announce("Configuración actualizada desde otra pestaña.");
    }
  } catch (e) {
    announce(e.message);
  }
});
// Cancelar debe cargar también la última revisión que entró durante la edición.
dialog.addEventListener("close", async () => {
  try {
    current = await store.read();
    renderConfig();
  } catch (e) {
    announce(e.message);
  }
});
try {
  current = await store.read();
} catch (e) {
  loadFailed = true;
  announce(
    `No se pudo cargar la configuración: ${e.message} Los datos originales se conservan. Recarga para reintentar.`,
  );
}
renderConfig();
