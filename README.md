# New Tab Blocks

A Chrome extension that replaces the default new tab page with a customizable grid of link blocks.

## Features

- Replace the browser new tab page with a custom start screen.
- Add, edit, delete, and rearrange link blocks.
- Choose each block's name, URL, color, icon visibility, and title visibility.
- Drag and drop blocks to move them across the grid.
- Customize the background with a solid color or image.
- Save blocks and settings with `chrome.storage.local`.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript
- Chrome Extensions Manifest V3

## Project Structure

```text
.
├── manifest.json
├── newtab.html
├── newtab.js
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
- `newtab.js` handles rendering, editing, drag and drop, persistence, and background settings.
- `styles.css` defines the layout, grid, and visual design.

## Current Status

This project is currently at version `0.1.0` and includes editable shortcut blocks, layout management, and background customization.

## License

Add the license you want for the project here, for example `MIT`.
