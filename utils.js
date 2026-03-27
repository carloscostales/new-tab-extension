import { defaultSettings } from "./constants.js";

export function createId() {
  return crypto.randomUUID();
}

export function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function normalizeLink(link) {
  return {
    id: link.id || createId(),
    title: link.title || "Untitled",
    url: link.url || "",
    color: link.color || "#4b5563",
    col: Number.parseInt(link.col, 10) || 1,
    row: Number.parseInt(link.row, 10) || 1,
    showTitle: typeof link.showTitle === "boolean" ? link.showTitle : true,
    showIcon: typeof link.showIcon === "boolean" ? link.showIcon : true
  };
}

export function normalizeSettings(value) {
  const backgroundColor = typeof value?.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(value.backgroundColor)
    ? value.backgroundColor
    : defaultSettings.backgroundColor;
  const backgroundImage = typeof value?.backgroundImage === "string"
    ? value.backgroundImage.trim()
    : defaultSettings.backgroundImage;
  const showGridAlways = typeof value?.showGridAlways === "boolean"
    ? value.showGridAlways
    : defaultSettings.showGridAlways;

  return { backgroundColor, backgroundImage, showGridAlways };
}

function mixChannel(channelA, channelB, amount) {
  return Math.round(channelA + (channelB - channelA) * amount);
}

function hexToRgb(color) {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return { red, green, blue };
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getDerivedEmptyColor(backgroundColor) {
  const { red, green, blue } = hexToRgb(backgroundColor);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  const target = brightness > 160 ? 210 : 255;
  const amount = brightness > 160 ? 0.14 : 0.18;

  return rgbToHex(
    mixChannel(red, target, amount),
    mixChannel(green, target, amount),
    mixChannel(blue, target, amount)
  );
}

export function getTextColor(backgroundColor) {
  const color = backgroundColor.replace("#", "");
  const normalized = color.length === 3
    ? color.split("").map((value) => `${value}${value}`).join("")
    : color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 160 ? "#111827" : "#ffffff";
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Unable to read the selected image.")));
    reader.readAsDataURL(file);
  });
}
