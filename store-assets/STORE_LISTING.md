# Store listing text (Edge Add-ons / Chrome Web Store / Firefox Add-ons)

**Name:** Breakless (comes from manifest.json)

**Short description (≤132 chars):**
Watch movies, shows and videos without ad breaks. Skips and removes ads automatically on Prime Video, JioHotstar and YouTube.

**Category:** Entertainment

**Search terms:** ad skipper, skip ads, streaming, movies, tv shows, ad blocker, video ads, youtube ad skipper

**Website:** https://github.com/Shivendra-99/Breakless
**Support:** https://github.com/Shivendra-99/Breakless/issues
**Privacy policy:** https://github.com/Shivendra-99/Breakless/blob/main/PRIVACY.md

## Description

Breakless lets you watch movies, shows and videos without sitting through ad breaks.

When an ad starts, Breakless jumps past it automatically, keeps it muted, and brings your show straight back with sound on. A clear on-screen card tells you what's happening. If a jump isn't possible, it fast-forwards the ad silently instead.

Works with Prime Video, JioHotstar and YouTube in your browser.

FEATURES
• Skips ad breaks in movies and shows automatically
• Removes Prime Video ads before they even load
• YouTube: clicks "Skip" the moment it appears, otherwise mutes the ad and jumps to its end; hides ads in the feed, search and sidebar
• Clicks the service's own "Skip" button when one appears
• Blocks known ad requests and hides ad banners
• One switch per site, plus a counter of ad breaks handled
• No account, no setup, no data collection: settings stay in your browser

GOOD TO KNOW
• Don't want it on a site? Switch that site off in the Breakless menu.
• Live sports ad breaks are muted, not skipped.
• Streaming sites change their players often. If an ad gets through, please report it on GitHub so it can be fixed quickly.

Breakless is an independent project and is not affiliated with, endorsed by or sponsored by Amazon or JioStar. Product names are used only to describe compatibility.

## Notes for certification

Breakless runs only on primevideo.com, Prime Video pages on amazon.* domains, hotstar.com / jiohotstar.com, and youtube.com. It contains no remote code, no analytics and makes no network requests of its own. Settings are kept in chrome.storage.local.

YouTube test: play any YouTube video with a pre-roll ad. The ad is muted and skipped within a second, and ad slots in the feed are hidden.

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

## What's new in 0.3.0 (for update notes)

- New: YouTube. Skips video ads (Skip button, or mute and jump to the end) and hides ad slots. On by default, like Prime Video and JioHotstar.
- Prime Video: "Remove ads before they load" is now on for everyone (was beta).
- The menu now warns when the browser has switched off Breakless's site access (happens on Edge) and offers an Allow button.
- A welcome tab after install and after this update.

## Chrome Web Store → Privacy practices (answers for 0.3.0)

**Single purpose:** Breakless skips and removes ads during video playback on the video sites it supports (Prime Video, JioHotstar and YouTube).

**storage:** Saves the user's on/off switches and a counter of ad breaks handled, locally in the browser.

**declarativeNetRequest:** Blocks known ad requests (ad decisions and ad videos) on Prime Video and JioHotstar, using fixed rules bundled with the extension.

**scripting:** Registers one bundled script on youtube.com only while the user has the optional "Remove YouTube ads before they load" mode switched on. No remote code is used.

**Host permissions:** Prime Video, JioHotstar and YouTube pages (and Prime Video pages on Amazon domains) to detect and skip ad breaks in the player and hide ad slots.

**Remote code:** No.

**Data usage:** Collects nothing. Tick none of the data types; certify all three disclosures.
