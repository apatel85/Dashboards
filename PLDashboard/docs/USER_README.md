# P&L Dashboard — User Guide

A practical guide for using the dashboard day-to-day.

---

## Quick start

### Step 1 — Open the app

Go to: **https://apatel85.github.io/pl-dashboard/pl-dashboard-v8.html**

Bookmark it. This is the only URL you'll ever need.

### Step 2 — Install it as an app (recommended)

Treating it like a real app means it works offline, has its own icon, and
launches in a clean window without browser tabs.

**On Windows / Mac / Linux (Chrome, Edge, Brave):**
1. With the dashboard open, look for an **Install** icon in the address bar
   (a little monitor with a down-arrow, or a "+" sign).
2. Click it → confirm. The app appears in your Start menu / Applications.

**On Android (Chrome, Edge, Samsung Internet, Brave):**
1. Tap the browser's **⋮** menu.
2. Tap **Add to Home Screen** or **Install app**.
3. Confirm. The app icon appears on your home screen.

**On iPhone / iPad (Safari):**
1. Tap the **Share** button (square with up-arrow) at the bottom of Safari.
2. Scroll down and tap **Add to Home Screen**.
3. Tap **Add**. The app icon appears on your home screen.

After installing, **always launch the app from the icon**, not from a
browser tab. This keeps your data safe and makes the experience smoother.

---

## How your data is stored

| Where | What | When |
|---|---|---|
| **Your device** (IndexedDB) | Every transaction, category, and setting | Saved instantly with every edit |
| **Browser localStorage** (your device) | Up to 5 recent automatic snapshots, app settings | Every few seconds while you work |
| **A file on your computer** (Layer 2 — optional) | A live `.csv` or `.xlsx` you choose | Updated automatically every 30 minutes |
| **Google Sheets** (Layer 3 — optional) | A full mirror in your own Google Drive | Auto-synced if you enable it (recommended) |

**Important:** Your financial data **never goes to our servers**. The app
runs entirely in your browser.

---

## What works without internet

Once installed (or visited once online), **everything except Google Sheets sync works offline**.

---

## Multi-device setup

1. Install on each device.
2. On first device: Backup → Connect Google Sheets → Create New Sheet → enable Auto-sync.
3. On each additional device: Backup → Connect Google Sheets → Link Existing Sheet → enable Auto-sync.

---

## Best practices

1. Always use the installed app icon, not a browser tab.
2. Enable Auto-sync to Google Sheets on every device.
3. Use the same Google account everywhere.
4. Set up Layer 2 (linked local file) on your main computer.
5. Export a JSON backup once a month.

---

## Troubleshooting

See the full guide in the original USER_README.md for detailed troubleshooting steps.

---

*Full version of this guide: `USER_README.md` (moved to `docs/` folder)*
