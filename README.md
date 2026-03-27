# New Tab Blocks

A Chrome extension that replaces the default new tab page with a customizable grid of link blocks.

## Features

- Replace the browser new tab page with a custom start screen.
- Add, edit, delete, and rearrange link blocks.
- Choose each block's name, URL, color, icon visibility, and title visibility.
- Drag and drop blocks to move them across the grid.
- Customize the background with a solid color or image.
- Import and export complete configurations as JSON files.
- Save blocks and settings with `chrome.storage.local`.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- Chrome Extensions Manifest V3

## Project Structure

```text
.
├── constants.js
├── manifest.json
├── newtab.html
├── newtab.js
├── storage.js
├── utils.js
└── styles.css
```

## Local Development

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open a new tab to see the extension.

## How It Works

- `manifest.json` registers the extension and overrides the default new tab page.
- `newtab.html` contains the page structure and editor UI.
- `constants.js` centralizes default data and shared configuration.
- `storage.js` handles persistence plus import/export.
- `utils.js` contains reusable normalization and UI helpers.
- `newtab.js` handles rendering, editing, drag and drop, and wires the modules together.
- `styles.css` defines the layout, grid, and visual design.

## Current Status

This project is currently at version `0.1.0` and includes editable shortcut blocks, layout management, and background customization.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
