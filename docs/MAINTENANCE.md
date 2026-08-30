# Weather Forecast Maintenance Guide

## Project boundary

This repository is a dependency-light static PWA. `index.html` contains the UI
and browser logic; `manifest.webmanifest` and `sw.js` provide installability
and offline fallback. There is no build step and no application server.

## Data flow

1. City weather, forecast, air quality and geocoding come from Open-Meteo.
2. Satellite imagery comes from NASA GIBS; radar comes from RainViewer.
3. Typhoon data is requested live from CMA and NHC when the browser can reach
   them.
4. `data/typhoons.json` is the offline fallback snapshot.
5. `.github/workflows/update-typhoons.yml` runs every 30 minutes, calls
   `scripts/update_typhoons.py`, and commits the snapshot only when it changes.
6. GitHub Pages publishes the `main` branch root directory.

The snapshot improves resilience but does not turn this app into an emergency
warning service. Always show the provider and update time when presenting
storm information.

## Change workflow

Keep `main` deployable. Use short-lived branches such as:

- `feat/forecast-comparison`
- `fix/map-fallback`
- `docs/provider-attribution`

Before committing, run:

```bash
python scripts/validate_project.py
```

For UI changes, also run a local HTTP server because `file://` cannot register
the service worker:

```bash
python -m http.server 8080
```

Open `http://127.0.0.1:8080/` and check the city search, forecast, satellite,
radar, typhoon, refresh and install/offline flows. For phone testing, use the
computer's current LAN IP, not a previously recorded address.

## Release and rollback

Use semantic tags for stable milestones, for example `v0.1.0`. Keep user-visible
changes in `CHANGELOG.md`. If a deployment is broken, first revert the offending
commit or select the previous known-good tag in GitHub Pages; do not delete the
typhoon snapshot as it is the offline fallback.

## External services and attribution

Keep provider names and map attribution visible in the UI. Before expanding
traffic or adding commercial use, recheck each provider's terms, rate limits,
tile caching rules and required attribution. Never add API keys, cookies or
tokens to this repository.
