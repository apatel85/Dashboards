# Privacy Policy — QA Capture

Last updated: October 17, 2026

QA Capture is a browser extension for QA testers. It records what you click on websites you are testing and files bug reports (with an optional screenshot) to a GitHub repository **you** control.

## What the extension collects and where it goes

- **Click trail** — the pages you visit and the buttons/links you click, **only on websites you have added as watched projects in the extension's Settings**. Nothing is recorded on other sites.
- **Screenshots** — a screenshot of the current browser tab is captured **only when you click "Capture & send"**, and only if the "Include screenshot" box is checked.
- **Bug details you type** — title, severity, expected vs. actual behavior.
- **Your GitHub personal access token** — stored only in the browser's local extension storage on your device. It is sent only to `api.github.com` to file your bug reports into your repository. It is never sent anywhere else.

All filed bug reports (click trail, screenshot, and your notes) are committed to **your own GitHub repository** that you configure in Settings.

## What we do NOT do

- No analytics, telemetry, or tracking of any kind.
- No data is sent to the extension author or any third party.
- No data is sold, shared, or used for advertising.
- The extension does not run on websites you have not added as watched projects.

## Permissions used and why

- **tabs / activeTab** — to capture the screenshot of the tab you are filing a bug from.
- **storage** — to keep your Settings (projects, GitHub token, repo name) on your device.
- **Host access (`<all_urls>`)** — the extension is a generic QA tool for any site you test. Its content script loads on pages but stays completely dormant unless the site matches a project you configured in Settings.
- **api.github.com** — the only network destination besides your configured repository host: used solely to commit your bug reports.

## Contact

Questions about this policy: file an issue in the repository where you found this extension, or contact the repository owner.
