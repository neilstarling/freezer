# Freezer Inventory PWA

A browser-based Progressive Web App for tracking what's stored in your freezer, including item counts, categories, and expiration dates.

## Features

- **Add items**: Enter an item name, assign it to Hers, His, or Shared, select a food category, and optionally set a sell-by date
- **Automatic expiry**: Items expire 30 days after they are added
- **Time remaining**: Each item shows the percentage of its 30-day lifespan remaining
- **Quick add**: Re-add previously used items from a deduplicated list (name, owner, and category pre-filled; just set a new sell-by date)
- **Manage food categories**: Add, rename, and delete categories; deleting one moves its items to Shared / Uncategorized
- **Inventory view**: See all items as color-coded tiles with owner and category labels
- **Expiration tracking**: Visual warnings for expired items (red) and soon-to-expire items (orange)
- **Filter by status**: View All or Expired items
- **Sort items**: Sort by name, expiry date, or sell-by date
- **Delete items**: Remove items you've used up
- **Export/Import**: Back up your inventory as JSON and restore it later (adds imported items to the current list)
- **Offline-first**: Works without an internet connection after first visit
- **Installable**: Add to home screen as a standalone app

## Getting Started

1. Serve the `freezer/` folder from a local web server or HTTPS host (required for service worker registration)
   - Example with Python: `python3 -m http.server 8000` inside the `freezer/` folder
   - Example with Node.js: `npx http-server`
2. Open `http://localhost:8000` in a modern browser
3. Visit once while online to cache the app shell for offline use

## Data Storage

Your freezer inventory is stored in your browser's local storage. Export a JSON backup regularly to avoid data loss. Clearing browser site data will remove your local inventory.

## Icons

The app references three icon files in `icons/`:
- `icons/freezer192.png` (192x192)
- `icons/freezer512.png` (512x512)
- `icons/freezer512-maskable.png` (512x512)

These are optional but recommended for home screen installation. Add your own PNG icons there.

## Project Structure

```
freezer/
├── manifest.webmanifest   # PWA manifest
├── service-worker.js      # Caches app shell for offline loading
├── index.html             # Main HTML
├── style.css              # Styling
├── app.js                 # Application logic
├── icons/                 # App icons (add your own)
└── README.md