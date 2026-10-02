# Radio Golden Hour
Live local FM radio from cities currently at sunset. Vanilla HTML/CSS/JS, no build, no API keys.

**Data:** SunCalc (cdnjs) · Radio Browser API · Open-Meteo · cities.json (~65 cities)

## Deploy
Push this folder to GitHub → connect to Cloudflare Pages (build command: none, output dir: `/`).

## Before launch
- Add a 1200×630 `preview.png` (included as a placeholder if generated) for social cards.
- For best installability on Android, add 192/512 PNG icons to `manifest.json` (SVG icon is used now).
- Streams must be HTTPS; the app filters out HTTP-only stations to avoid mixed-content blocking.

## Notes
Sunset times are shown in local mean solar time (from longitude). "Drift West" moves to the next city whose sunset comes later. Edit `cities.json` to add cities.
