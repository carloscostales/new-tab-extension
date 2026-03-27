import { PAGE_TOP_OFFSET, addIcon, defaultLinks, defaultSettings } from "./constants.js";
import {
  buildExportPayload,
  parseImportedConfig,
  readStoredLinks,
  readStoredSettings,
  saveLinks,
  saveSettings
} from "./storage.js";
import {
  getDerivedEmptyColor,
  getHostname,
  getTextColor,
  normalizeLink,
  normalizeSettings,
  readFileAsDataUrl
} from "./utils.js";

const blocksContainer = document.getElementById("blocks");
const blockTemplate = document.getElementById("block-template");
const addBlockTemplate = document.getElementById("add-block-template");
const pageMenu = document.getElementById("page-menu");
const pageMenuPanel = document.getElementById("page-menu-panel");
const editToggle = document.getElementById("edit-toggle");
const optionsToggle = document.getElementById("options-toggle");
const editor = document.getElementById("editor");
const editorEyebrow = document.getElementById("editor-eyebrow");
const editorTitle = document.getElementById("editor-title");
const editorClose = document.getElementById("editor-close");
const editorCancel = document.getElementById("editor-cancel");
const editorForm = document.getElementById("editor-form");
const editorError = document.getElementById("editor-error");
const settingsForm = document.getElementById("settings-form");
const settingsMessage = document.getElementById("settings-message");
const clearImageButton = document.getElementById("clear-image");
const backgroundImageFileInput = document.getElementById("background-image-file");
const configImportFileInput = document.getElementById("config-import-file");
const exportConfigButton = document.getElementById("export-config");
const importConfigButton = document.getElementById("import-config");
const colSelect = document.getElementById("block-col");
const rowSelect = document.getElementById("block-row");
const backgroundColorInput = document.getElementById("background-color");
const backgroundImageUrlInput = document.getElementById("background-image-url");

let links = [];
let isEditing = false;
let gridColumns = 1;
let gridRows = 1;
let activePanel = "blocks";
let settings = { ...defaultSettings };
let draggedLinkId = "";
let highlightedDropCell = null;
let highlightedEditorCell = null;
let previewBackgroundImage = "";

function getGridMetrics() {
  const styles = getComputedStyle(document.documentElement);
  const tileSize = Number.parseFloat(styles.getPropertyValue("--tile-size")) || 120;
  const gap = Number.parseFloat(styles.getPropertyValue("--gap")) || 12;

  return { tileSize, gap };
}

function getMaxOccupiedColumn() {
  return links.reduce((max, link) => Math.max(max, link.col), 1);
}

function getMaxOccupiedRow() {
  return links.reduce((max, link) => Math.max(max, link.row), 1);
}

function updateGridDimensions() {
  const { tileSize, gap } = getGridMetrics();
  const availableWidth = Math.max(window.innerWidth - gap * 2, tileSize);
  const availableHeight = Math.max(window.innerHeight - PAGE_TOP_OFFSET - gap * 2, tileSize);
  const visibleColumns = Math.max(1, Math.floor((availableWidth + gap) / (tileSize + gap)));
  const visibleRows = Math.max(1, Math.floor((availableHeight + gap) / (tileSize + gap)));

  gridColumns = Math.max(visibleColumns, getMaxOccupiedColumn(), 1);
  gridRows = Math.max(visibleRows, getMaxOccupiedRow(), 1);

  blocksContainer.style.setProperty("--grid-columns", String(gridColumns));
  blocksContainer.style.setProperty("--grid-rows", String(gridRows));
}

function downloadTextFile(filename, contents, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

function applySettings(nextSettings = settings, previewImage = nextSettings.backgroundImage) {
  document.documentElement.style.setProperty("--page-bg", nextSettings.backgroundColor);
  document.documentElement.style.setProperty("--empty-bg", getDerivedEmptyColor(nextSettings.backgroundColor));
  document.body.style.backgroundColor = nextSettings.backgroundColor;

  if (previewImage) {
    document.body.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2)), url("${previewImage.replace(/"/g, '\\"')}")`;
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundAttachment = "fixed";
  } else {
    document.body.style.backgroundImage = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat = "";
    document.body.style.backgroundSize = "";
    document.body.style.backgroundAttachment = "";
  }
}

function isCellTaken(row, col, ignoredId = "") {
  return links.some((link) => link.row === row && link.col === col && link.id !== ignoredId);
}

function fillPositionOptions(selectedCol = 1, selectedRow = 1, ignoredId = "") {
  colSelect.replaceChildren();
  rowSelect.replaceChildren();

  for (let col = 1; col <= gridColumns; col += 1) {
    const option = document.createElement("option");
    option.value = String(col);
    option.textContent = String(col);
    option.selected = col === selectedCol;
    colSelect.appendChild(option);
  }

  for (let row = 1; row <= gridRows; row += 1) {
    const option = document.createElement("option");
    option.value = String(row);
    option.textContent = String(row);
    option.selected = row === selectedRow;
    rowSelect.appendChild(option);
  }

  editorError.textContent = isCellTaken(selectedRow, selectedCol, ignoredId)
    ? "That cell is already occupied."
    : "";
}

function closeEditor() {
  editor.classList.remove("is-open");
  editor.setAttribute("aria-hidden", "true");
  editorError.textContent = "";
  settingsMessage.textContent = "";
  highlightedEditorCell = null;
  previewBackgroundImage = "";
  applySettings();
  renderBlocks();
}

function clearDragState() {
  if (highlightedDropCell) {
    highlightedDropCell.classList.remove("cell--drop-target");
    highlightedDropCell = null;
  }

  draggedLinkId = "";
  document.body.classList.remove("is-dragging");
}

function setMenuOpen(nextValue) {
  pageMenu.classList.toggle("is-open", nextValue);
  pageMenuPanel.setAttribute("aria-hidden", String(!nextValue));
}

function setEditing(nextValue) {
  isEditing = nextValue;
  document.body.classList.toggle("is-editing", isEditing);
  editToggle.textContent = isEditing ? "Done" : "Edit";
  editToggle.setAttribute("aria-pressed", String(isEditing));

  if (!isEditing) {
    clearDragState();
    closeEditor();
  }
}

function setActivePanel(panel) {
  activePanel = panel;
  const isSettingsPanel = panel === "settings";

  editorEyebrow.textContent = isSettingsPanel ? "General Options" : "Block Editor";
  editorTitle.textContent = isSettingsPanel ? "Background" : "New block";
  editorForm.classList.toggle("editor__form--hidden", isSettingsPanel);
  settingsForm.classList.toggle("editor__form--hidden", !isSettingsPanel);
}

function setHighlightedEditorCell(position) {
  if (!position) {
    highlightedEditorCell = null;
    return;
  }

  highlightedEditorCell = {
    row: position.row,
    col: position.col
  };
}

function openEditor(link, position = null) {
  setActivePanel("blocks");
  editorForm.reset();
  editorError.textContent = "";

  if (link) {
    editorTitle.textContent = "Edit block";
    editorForm.elements.id.value = link.id;
    editorForm.elements.title.value = link.title;
    editorForm.elements.url.value = link.url;
    editorForm.elements.color.value = link.color;
    editorForm.elements.showTitle.checked = link.showTitle;
    editorForm.elements.showIcon.checked = link.showIcon;
    fillPositionOptions(link.col, link.row, link.id);
    setHighlightedEditorCell({ row: link.row, col: link.col });
  } else {
    editorTitle.textContent = "New block";
    editorForm.elements.id.value = "";
    editorForm.elements.color.value = "#4f46e5";
    editorForm.elements.showTitle.checked = true;
    editorForm.elements.showIcon.checked = true;
    fillPositionOptions(position?.col || 1, position?.row || 1);
    setHighlightedEditorCell({
      row: position?.row || 1,
      col: position?.col || 1
    });
  }

  editor.classList.add("is-open");
  editor.setAttribute("aria-hidden", "false");
  renderBlocks();
  editorForm.elements.title.focus();
}

function openSettings() {
  setMenuOpen(false);
  setActivePanel("settings");
  setHighlightedEditorCell(null);
  settingsMessage.textContent = "";
  backgroundColorInput.value = settings.backgroundColor;
  backgroundImageUrlInput.value = settings.backgroundImage;
  settingsForm.elements.showGridAlways.checked = settings.showGridAlways;
  backgroundImageFileInput.value = "";
  configImportFileInput.value = "";
  editor.classList.add("is-open");
  editor.setAttribute("aria-hidden", "false");
  applySettings(settings, settings.backgroundImage);
  renderBlocks();
  backgroundColorInput.focus();
}

function getLinkAtPosition(row, col) {
  return links.find((link) => link.row === row && link.col === col) || null;
}

function createBlockNode(link) {
  const blockNode = blockTemplate.content.cloneNode(true);
  const wrapper = blockNode.querySelector(".block-wrapper");
  const anchor = blockNode.querySelector(".block");
  const icon = blockNode.querySelector(".block__icon");
  const title = blockNode.querySelector(".block__title");
  const deleteButton = blockNode.querySelector('[data-action="delete"]');
  const hostname = getHostname(link.url);
  const isPreviewLink = link.id === "preview-link";

  wrapper.dataset.id = link.id;
  wrapper.draggable = isEditing && !isPreviewLink;
  anchor.href = isPreviewLink ? "#" : link.url;
  anchor.style.backgroundColor = link.color;
  anchor.style.color = getTextColor(link.color);
  anchor.setAttribute("aria-label", link.title);
  anchor.addEventListener("click", (event) => {
    if (isEditing) {
      event.preventDefault();
      if (!isPreviewLink) {
        openEditor(link);
      }
    }
  });
  icon.src = hostname
    ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
    : "";
  icon.alt = "";
  icon.hidden = !link.showIcon;
  title.textContent = link.title;
  title.hidden = !link.showTitle;
  deleteButton.hidden = isPreviewLink;

  deleteButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    links = links.filter((item) => item.id !== link.id);
    await saveLinks(links);
    renderBlocks();
  });

  wrapper.addEventListener("dragstart", (event) => {
    if (!isEditing) {
      event.preventDefault();
      return;
    }

    draggedLinkId = link.id;
    document.body.classList.add("is-dragging");
    wrapper.classList.add("block-wrapper--dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", link.id);
    }
  });

  wrapper.addEventListener("dragend", () => {
    wrapper.classList.remove("block-wrapper--dragging");
    clearDragState();
  });

  return blockNode;
}

function createAddBlockNode(position) {
  const addNode = addBlockTemplate.content.cloneNode(true);
  const button = addNode.querySelector("#add-block");
  const icon = addNode.querySelector(".block__icon");

  icon.src = addIcon;
  button.addEventListener("click", () => openEditor(null, position));

  return addNode;
}

function createEmptyCellNode() {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "block block--empty";
  button.setAttribute("aria-hidden", "true");
  button.tabIndex = -1;

  return button;
}

function getEditorPreviewLink() {
  if (activePanel !== "blocks" || !editor.classList.contains("is-open")) {
    return null;
  }

  const id = String(editorForm.elements.id.value || "").trim();
  const col = Number.parseInt(colSelect.value, 10);
  const row = Number.parseInt(rowSelect.value, 10);

  if (!Number.isInteger(col) || !Number.isInteger(row)) {
    return null;
  }

  return normalizeLink({
    id: id || "preview-link",
    title: String(editorForm.elements.title.value || "").trim() || "New block",
    url: String(editorForm.elements.url.value || "").trim() || "https://example.com",
    color: String(editorForm.elements.color.value || "").trim() || "#4f46e5",
    col,
    row,
    showTitle: Boolean(editorForm.elements.showTitle.checked),
    showIcon: Boolean(editorForm.elements.showIcon.checked)
  });
}

function createCell(row, col, content) {
  const cell = document.createElement("div");

  cell.className = "cell";
  cell.dataset.row = String(row);
  cell.dataset.col = String(col);
  cell.style.gridColumn = String(col);
  cell.style.gridRow = String(row);

  if (highlightedEditorCell?.row === row && highlightedEditorCell?.col === col) {
    cell.classList.add("cell--editor-target");
  }

  cell.appendChild(content);

  return cell;
}

function renderBlocks() {
  const fragment = document.createDocumentFragment();
  const shouldShowEmptyCells = isEditing || settings.showGridAlways;
  const previewLink = getEditorPreviewLink();

  blocksContainer.replaceChildren();
  updateGridDimensions();

  if (!shouldShowEmptyCells) {
    for (const link of links) {
      const cellLink = previewLink && previewLink.row === link.row && previewLink.col === link.col && previewLink.id === link.id
        ? previewLink
        : link;
      fragment.appendChild(createCell(link.row, link.col, createBlockNode(cellLink)));
    }
  } else {
    for (let row = 1; row <= gridRows; row += 1) {
      for (let col = 1; col <= gridColumns; col += 1) {
        const link = getLinkAtPosition(row, col);
        const shouldRenderPreview = previewLink
          && previewLink.row === row
          && previewLink.col === col
          && (!link || link.id === previewLink.id);

        if (shouldRenderPreview && previewLink) {
          fragment.appendChild(createCell(row, col, createBlockNode(previewLink)));
        } else if (link) {
          fragment.appendChild(createCell(row, col, createBlockNode(link)));
        } else if (isEditing) {
          fragment.appendChild(createCell(row, col, createAddBlockNode({ row, col })));
        } else {
          fragment.appendChild(createCell(row, col, createEmptyCellNode()));
        }
      }
    }
  }

  blocksContainer.appendChild(fragment);
}

function setHighlightedDropCell(cell) {
  if (highlightedDropCell === cell) {
    return;
  }

  if (highlightedDropCell) {
    highlightedDropCell.classList.remove("cell--drop-target");
  }

  highlightedDropCell = cell;

  if (highlightedDropCell) {
    highlightedDropCell.classList.add("cell--drop-target");
  }
}

function getDraggedLink() {
  if (!draggedLinkId) {
    return null;
  }

  return links.find((link) => link.id === draggedLinkId) || null;
}

function getCellFromEventTarget(target) {
  return target instanceof Element ? target.closest(".cell") : null;
}

function isValidDropCell(cell) {
  const draggedLink = getDraggedLink();

  if (!isEditing || !draggedLink || !cell) {
    return false;
  }

  const row = Number.parseInt(cell.dataset.row || "", 10);
  const col = Number.parseInt(cell.dataset.col || "", 10);

  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return false;
  }

  return draggedLink.row !== row || draggedLink.col !== col;
}

async function moveDraggedLinkToCell(cell) {
  const draggedLink = getDraggedLink();

  if (!draggedLink || !isValidDropCell(cell)) {
    return;
  }

  const nextRow = Number.parseInt(cell.dataset.row || "", 10);
  const nextCol = Number.parseInt(cell.dataset.col || "", 10);
  const previousRow = draggedLink.row;
  const previousCol = draggedLink.col;
  const targetLink = getLinkAtPosition(nextRow, nextCol);

  links = links.map((link) => {
    if (link.id === draggedLink.id) {
      return { ...link, row: nextRow, col: nextCol };
    }

    if (targetLink && link.id === targetLink.id) {
      return { ...link, row: previousRow, col: previousCol };
    }

    return link;
  });

  await saveLinks(links);
  renderBlocks();
}

function handlePositionChange() {
  const id = String(editorForm.elements.id.value || "").trim();
  const col = Number.parseInt(colSelect.value, 10);
  const row = Number.parseInt(rowSelect.value, 10);

  editorError.textContent = isCellTaken(row, col, id) ? "That cell is already occupied." : "";
  setHighlightedEditorCell({ row, col });
  renderBlocks();
}

function handleBlockPreviewChange() {
  if (activePanel !== "blocks" || !editor.classList.contains("is-open")) {
    return;
  }

  renderBlocks();
}

async function handleSubmit(event) {
  event.preventDefault();
  editorError.textContent = "";

  const formData = new FormData(editorForm);
  const id = String(formData.get("id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const rawUrl = String(formData.get("url") || "").trim();
  const color = String(formData.get("color") || "").trim();
  const col = Number.parseInt(String(formData.get("col") || ""), 10);
  const row = Number.parseInt(String(formData.get("row") || ""), 10);
  const showTitle = formData.get("showTitle") === "on";
  const showIcon = formData.get("showIcon") === "on";

  let url = rawUrl;

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    new URL(url);
  } catch {
    editorError.textContent = "Enter a valid URL.";
    return;
  }

  if (isCellTaken(row, col, id)) {
    editorError.textContent = "That cell is already occupied.";
    return;
  }

  const nextLink = normalizeLink({ id, title, url, color, col, row, showTitle, showIcon });

  if (id) {
    links = links.map((link) => (link.id === id ? nextLink : link));
  } else {
    links = [...links, nextLink];
  }

  await saveLinks(links);
  closeEditor();
  renderBlocks();
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  settingsMessage.textContent = "";

  const backgroundColor = String(settingsForm.elements.backgroundColor.value || "").trim() || defaultSettings.backgroundColor;
  const imageUrl = String(settingsForm.elements.backgroundImage.value || "").trim();
  const showGridAlways = Boolean(settingsForm.elements.showGridAlways.checked);
  const selectedFile = backgroundImageFileInput.files?.[0] || null;
  let backgroundImage = imageUrl;

  if (selectedFile) {
    try {
      backgroundImage = await readFileAsDataUrl(selectedFile);
    } catch {
      settingsMessage.textContent = "Couldn't load that image.";
      return;
    }
  } else if (imageUrl) {
    try {
      const parsedUrl = new URL(imageUrl);

      if (!["http:", "https:", "data:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }

      backgroundImage = parsedUrl.toString();
    } catch {
      settingsMessage.textContent = "Enter a valid image URL.";
      return;
    }
  }

  settings = normalizeSettings({ backgroundColor, backgroundImage, showGridAlways });
  previewBackgroundImage = "";
  await saveSettings(settings);
  applySettings();
  renderBlocks();
  backgroundImageUrlInput.value = settings.backgroundImage;
  backgroundImageFileInput.value = "";
  settingsMessage.textContent = "Background saved.";
}

async function handleClearImage() {
  settings = normalizeSettings({ ...settings, backgroundImage: "" });
  previewBackgroundImage = "";
  await saveSettings(settings);
  applySettings();
  renderBlocks();
  backgroundImageUrlInput.value = "";
  backgroundImageFileInput.value = "";
  settingsMessage.textContent = "Image removed.";
}

function handleExportConfig() {
  const payload = buildExportPayload(links, settings);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  downloadTextFile(
    `new-tab-blocks-config-${timestamp}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
  settingsMessage.textContent = "Configuration exported.";
}

async function handleImportConfigFile(event) {
  const file = event.target.files?.[0] || null;

  if (!file) {
    return;
  }

  settingsMessage.textContent = "";

  try {
    const rawValue = await file.text();
    const importedConfig = parseImportedConfig(rawValue);

    links = importedConfig.links;
    settings = importedConfig.settings;
    previewBackgroundImage = "";

    await saveLinks(links);
    await saveSettings(settings);

    applySettings();
    updateGridDimensions();
    renderBlocks();

    backgroundColorInput.value = settings.backgroundColor;
    backgroundImageUrlInput.value = settings.backgroundImage;
    settingsForm.elements.showGridAlways.checked = settings.showGridAlways;
    backgroundImageFileInput.value = "";
    settingsMessage.textContent = "Configuration imported.";
  } catch (error) {
    settingsMessage.textContent = error instanceof Error
      ? error.message
      : "The configuration could not be imported.";
  } finally {
    configImportFileInput.value = "";
  }
}

function updateBackgroundPreview() {
  const previewSettings = normalizeSettings({
    ...settings,
    backgroundColor: String(backgroundColorInput.value || "").trim() || settings.backgroundColor,
    backgroundImage: settings.backgroundImage
  });

  const imageUrl = String(backgroundImageUrlInput.value || "").trim();
  const previewImage = previewBackgroundImage || imageUrl || "";

  applySettings(previewSettings, previewImage);
  renderBlocks();
}

async function handleBackgroundFilePreview() {
  const selectedFile = backgroundImageFileInput.files?.[0] || null;

  if (!selectedFile) {
    previewBackgroundImage = "";
    updateBackgroundPreview();
    return;
  }

  try {
    previewBackgroundImage = await readFileAsDataUrl(selectedFile);
    updateBackgroundPreview();
  } catch {
    settingsMessage.textContent = "Couldn't load that image.";
  }
}

async function initialize() {
  const storedLinks = await readStoredLinks();
  const storedSettings = await readStoredSettings();
  const initialLinks = Array.isArray(storedLinks) ? storedLinks : defaultLinks;

  links = initialLinks.map(normalizeLink);
  settings = normalizeSettings(storedSettings);
  applySettings();
  updateGridDimensions();

  if (!Array.isArray(storedLinks)) {
    await saveLinks(links);
  }

  if (!storedSettings || typeof storedSettings !== "object") {
    await saveSettings(settings);
  }

  renderBlocks();
}

editToggle.addEventListener("click", () => {
  setMenuOpen(false);
  setEditing(!isEditing);
  renderBlocks();
});

optionsToggle.addEventListener("click", openSettings);
editorClose.addEventListener("click", closeEditor);
editorCancel.addEventListener("click", closeEditor);
editorForm.addEventListener("submit", handleSubmit);
settingsForm.addEventListener("submit", handleSettingsSubmit);
clearImageButton.addEventListener("click", handleClearImage);
exportConfigButton.addEventListener("click", handleExportConfig);
importConfigButton.addEventListener("click", () => configImportFileInput.click());
configImportFileInput.addEventListener("change", handleImportConfigFile);
colSelect.addEventListener("change", handlePositionChange);
rowSelect.addEventListener("change", handlePositionChange);
editorForm.elements.title.addEventListener("input", handleBlockPreviewChange);
editorForm.elements.url.addEventListener("input", handleBlockPreviewChange);
editorForm.elements.color.addEventListener("input", handleBlockPreviewChange);
editorForm.elements.showTitle.addEventListener("change", handleBlockPreviewChange);
editorForm.elements.showIcon.addEventListener("change", handleBlockPreviewChange);
backgroundColorInput.addEventListener("input", updateBackgroundPreview);
backgroundImageUrlInput.addEventListener("input", () => {
  previewBackgroundImage = "";
  updateBackgroundPreview();
});
backgroundImageFileInput.addEventListener("change", handleBackgroundFilePreview);
window.addEventListener("resize", renderBlocks);
blocksContainer.addEventListener("dragover", (event) => {
  const cell = getCellFromEventTarget(event.target);

  if (!isValidDropCell(cell)) {
    setHighlightedDropCell(null);
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  setHighlightedDropCell(cell);
});
blocksContainer.addEventListener("drop", async (event) => {
  const cell = getCellFromEventTarget(event.target);

  if (!isValidDropCell(cell)) {
    clearDragState();
    return;
  }

  event.preventDefault();
  await moveDraggedLinkToCell(cell);
  clearDragState();
});
blocksContainer.addEventListener("dragleave", (event) => {
  if (event.currentTarget instanceof Element && event.currentTarget.contains(event.relatedTarget)) {
    return;
  }

  setHighlightedDropCell(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenuOpen(false);
  }
});

initialize();
