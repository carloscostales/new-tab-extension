import {
  CONFIG_EXPORT_VERSION,
  FALLBACK_SETTINGS_KEY,
  FALLBACK_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  STORAGE_KEY
} from "./constants.js";
import { normalizeLink, normalizeSettings } from "./utils.js";

function readFallbackLinks() {
  try {
    const rawValue = localStorage.getItem(FALLBACK_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

function writeFallbackLinks(nextLinks) {
  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(nextLinks));
  } catch {
    // Ignore fallback storage failures.
  }
}

function readFallbackSettings() {
  try {
    const rawValue = localStorage.getItem(FALLBACK_SETTINGS_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
  } catch {
    return null;
  }
}

function writeFallbackSettings(nextSettings) {
  try {
    localStorage.setItem(FALLBACK_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch {
    // Ignore fallback storage failures.
  }
}

export function readStoredLinks() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve(readFallbackLinks());
      return;
    }

    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        resolve(readFallbackLinks());
        return;
      }

      const storedLinks = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : null;
      resolve(storedLinks ?? readFallbackLinks());
    });
  });
}

export function readStoredSettings() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve(readFallbackSettings());
      return;
    }

    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        resolve(readFallbackSettings());
        return;
      }

      const storedSettings = result[SETTINGS_STORAGE_KEY];
      resolve(storedSettings ?? readFallbackSettings());
    });
  });
}

export function saveLinks(nextLinks) {
  return new Promise((resolve) => {
    writeFallbackLinks(nextLinks);

    if (!chrome?.storage?.local) {
      resolve();
      return;
    }

    chrome.storage.local.set({ [STORAGE_KEY]: nextLinks }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save links to chrome.storage.local:", chrome.runtime.lastError.message);
      }

      resolve();
    });
  });
}

export function saveSettings(nextSettings) {
  return new Promise((resolve) => {
    writeFallbackSettings(nextSettings);

    if (!chrome?.storage?.local) {
      resolve();
      return;
    }

    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: nextSettings }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to save settings to chrome.storage.local:", chrome.runtime.lastError.message);
      }

      resolve();
    });
  });
}

export function buildExportPayload(links, settings) {
  return {
    version: CONFIG_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    links,
    settings
  };
}

function sanitizeImportedLinks(value) {
  if (!Array.isArray(value)) {
    throw new Error("The file does not include a valid links list.");
  }

  const seenPositions = new Set();

  return value.map((item) => {
    const nextLink = normalizeLink(item);
    let normalizedUrl = String(nextLink.url || "").trim();

    if (!normalizedUrl) {
      throw new Error("One imported block is missing its URL.");
    }

    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      normalizedUrl = new URL(normalizedUrl).toString();
    } catch {
      throw new Error(`The block "${nextLink.title}" has an invalid URL.`);
    }

    if (nextLink.row < 1 || nextLink.col < 1) {
      throw new Error(`The block "${nextLink.title}" has an invalid position.`);
    }

    const positionKey = `${nextLink.row}:${nextLink.col}`;

    if (seenPositions.has(positionKey)) {
      throw new Error("The imported file has multiple blocks in the same cell.");
    }

    seenPositions.add(positionKey);

    return {
      ...nextLink,
      url: normalizedUrl
    };
  });
}

export function parseImportedConfig(rawValue) {
  let parsedValue;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (!parsedValue || typeof parsedValue !== "object") {
    throw new Error("The selected file does not contain a valid configuration.");
  }

  const importedLinks = sanitizeImportedLinks(parsedValue.links);
  const importedSettings = normalizeSettings(parsedValue.settings);

  return {
    links: importedLinks,
    settings: importedSettings
  };
}
