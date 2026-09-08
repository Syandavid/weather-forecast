# Professional cloud/rain view (v28)

- Existing GitHub Pages app, Leaflet city imagery, 3D, routes, timeline, and custom boundaries remain in place. No paid account or API key is introduced.
- Map → 专业云雨 opens the official Windy embed with ECMWF rain selected. Use Windy's layer menu for clouds and its own bottom timeline for forecasts. Reference and generated URL verified at https://embed.windy.com/config/map on 2026-09-09.
- The iframe is loaded only after selection. It gets approximate city coordinates (one decimal degree), not precise GPS/map-pick coordinates; referrer and device permissions are restricted. City names are rendered with textContent.
- No private weather endpoints, tile scraping, fabricated textures, or unofficial cross-origin messaging. Weather, labels and boundaries inside the iframe belong to Windy and do not share native route/boundary controls. Forecast clouds are not future satellite photographs.
- Native animation stops on entry. Exit removes the iframe to release its animations/network activity, but preserves the native map state. Reentry/reload starts a fresh embed at the selected city; Windy's in-frame timestamp is not retained or readable by the host. This is disclosed in the UI.
- Retries replace the iframe; stale load/error callbacks are ignored. Load is not presented as proof that weather tiles succeeded. Persistent retry/external-open links and a slow-connection hint remain available. External iframe documents bypass the app service worker, including its offline HTML fallback.

## Checks

`node --test scripts/test_insights.cjs scripts/test_map_timeline.cjs scripts/test_pro_weather.cjs`

`python scripts/validate_project.py`

Browser acceptance: mobile/desktop layout, rain and cloud layer selection, changing the embedded time visibly changes weather, reenter native 2D map with state intact, switching city, retry and external link, refreshing the published site. A desktop responsive viewport is not an actual iPhone test; regional third-party availability may differ.

Local browser checks on 2026-09-09: 390×844 and 1280×800 layouts rendered; Guangzhou rain changed visibly between Sep 9 07:00 and Sep 11 23:00; switching to clouds changed the displayed layer. Native 2D retained Sep 11 07:00 and the city imagery selection across a pro-mode roundtrip. Selecting Shanghai replaced the embed with lat=31.2/lon=121.5, retry retained exactly one iframe, and no console errors were recorded in that check. All 34 automated tests and project integrity/syntax checks passed.
