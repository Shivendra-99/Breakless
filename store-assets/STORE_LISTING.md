# Store listing text (Edge Add-ons / Chrome Web Store / Firefox Add-ons)

**Name:** Breakless (comes from manifest.json)

**Short description (≤132 chars):**
Watch movies and shows without ad breaks. Skips and removes ads automatically on Prime Video and JioHotstar.

**Category:** Entertainment

**Search terms:** ad skipper, skip ads, streaming, movies, tv shows, ad blocker, video ads

**Website:** https://github.com/Shivendra-99/Breakless
**Support:** https://github.com/Shivendra-99/Breakless/issues
**Privacy policy:** https://github.com/Shivendra-99/Breakless/blob/main/PRIVACY.md

## Description

Breakless lets you watch movies and shows without sitting through ad breaks.

When an ad starts, Breakless jumps past it automatically, keeps it muted, and brings your show straight back with sound on. A clear on-screen card tells you what's happening. If a jump isn't possible, it fast-forwards the ad silently instead.

Works with Prime Video and JioHotstar in your browser.

FEATURES
• Skips ad breaks in movies and shows automatically
• Clicks the service's own "Skip" button when one appears
• Blocks known ad requests and hides ad banners
• Optional "remove ads before they load" mode for Prime Video (beta)
• One switch per site, plus a counter of ad breaks handled
• No account, no setup, no data collection: settings stay in your browser

GOOD TO KNOW
• Live sports ad breaks are muted, not skipped.
• Streaming sites change their players often. If an ad gets through, please report it on GitHub so it can be fixed quickly.

Breakless is an independent project and is not affiliated with, endorsed by or sponsored by Amazon or JioStar. Product names are used only to describe compatibility.

## Notes for certification

Breakless runs only on primevideo.com, Prime Video pages on amazon.* domains, and hotstar.com / jiohotstar.com. It contains no remote code, no analytics and makes no network requests of its own. Settings are kept in chrome.storage.local.

How to test: open a movie or episode on Prime Video with an ad-supported plan. When the ad countdown appears, the extension shows a "Skipping ad" card, jumps past the ad, and restores sound and speed afterwards. Without an ad-supported account, the repository includes an automated end-to-end test with mock player pages (test/run.js, see README) that exercises every feature.

## Images

| File | Size | Use |
|---|---|---|
| edge-logo-300.png | 300×300 | Extension logo (Edge, required) |
| icon512.png | 512×512 | Source icon |
| small-tile-440x280.png | 440×280 | Small promotional tile |
| large-tile-1400x560.png | 1400×560 | Large promotional tile |
| screenshot-1-skipping-1280x800.png | 1280×800 | Screenshot |
| screenshot-2-done-1280x800.png | 1280×800 | Screenshot |
| screenshot-3-popup-1280x800.png | 1280×800 | Screenshot |
