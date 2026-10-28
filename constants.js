export const LIMITS = Object.freeze({
  blocks: 200,
  columns: 12,
  rows: 20,
  jsonBytes: 3_000_000,
  imageBytes: 8_000_000,
  storedImage: 700_000,
});
export const STORAGE_KEY = "new-tab-blocks-v1";
export function defaults() {
  return {
    version: 1,
    links: ["Gmail", "YouTube", "GitHub", "ChatGPT", "Calendar", "Drive"].map(
      (title, i) => ({
        id: `initial-${i}`,
        title,
        url: [
          "https://mail.google.com/",
          "https://www.youtube.com/",
          "https://github.com/",
          "https://chatgpt.com/",
          "https://calendar.google.com/",
          "https://drive.google.com/",
        ][i],
        color: [
          "#c63832",
          "#d92020",
          "#24292f",
          "#087f64",
          "#2867c9",
          "#087e49",
        ][i],
        col: i + 1,
        row: 1,
        showTitle: true,
        showIcon: true,
      }),
    ),
    settings: {
      theme: "light",
      columns: 6,
      rows: 4,
      tileSize: 200,
      backgroundColor: "#eef1f4",
      backgroundImage: "",
      showGridAlways: true,
      favicons: false,
    },
  };
}
