# Changelog

## [Unreleased]

- Keep the weather PWA and scheduled typhoon snapshot workflow maintainable.
- Add offline integrity checks for the manifest, snapshot and updater script.
- Keep ordinary map point selection on the map page instead of switching to weather.
- Make the high-detail city imagery the default map base and add usable map-based route picking.
- Add a generated cartoon global-weather hero image with a clear typhoon eye and satellite motif.
- Use the selected typhoon-Earth artwork as the weather-page cover while keeping the compact app icon separate.
- Replace the generated cover with the user-selected typhoon-Earth artwork and clean screenshot-edge artifacts before display.
- Remove the standalone cloud badge from the selected weather cover while preserving the typhoon-Earth artwork.
- Move sunrise, sunset and daylight duration into the weather-page top area and add the nearest extreme-weather time reminder.
- Replace the home-screen and PWA icons with a high-contrast cartoon Earth, cloud, sun, typhoon and satellite emblem.
- Add bounded network requests, city-timezone-aware history dates and cancellation for stale route requests.

## 2026-08-30 - Weather timeline and globe

- Add the live solar terminator and night-side shading to 2D and 3D maps.
- Switch the 3D map to globe projection when zoomed out to about level 2.5.
- Show today's sunrise, sunset and daylight duration on the weather page.
- Redesign the trend area with daily/hourly modes, date-time range queries and a draggable time cursor.
- Add continuous +10/+15/+30/+60/+90/+120 minute cards using 15-minute forecast data when available.
- Enrich the clothing animation with cloud, scarf and wind motion states.
- Document the resolution, interpolation, globe and solar-geometry boundaries.
- Integrate true-color or infrared satellite overlays into the high-detail city base.
- Add Chinese/localized place-label rules, village-level map labels where the vector tiles provide them, configurable road classes and colored administrative boundary controls.
- Add OSM traffic-signal point loading, route planning and route-weather markers for a selected departure time.
- Add graceful fallback documentation for public Overpass limits and the lack of live traffic phase/congestion data.

## [0.1.0] - 2026-08-30

- Initial public PWA with city weather, forecast, air quality, satellite,
  radar, typhoon tracks and local alerts.
# 2026-08-30

- 新增二维/三维地图切换：三维模式显示道路、城镇名称、建筑立体效果和地形起伏。
- 新增关键道路与城镇名称图层，并支持地图任意点选后同步更新天气主页。
- 高清城市底图解除 9 级缩放限制，支持 10 级以上、最高约 19 级放大。
- 新增 Esri 高清城市底图模式，支持城市级放大查看；放大地图时自动提高天气场网格密度。
- 天气预报扩展至 16 天，新增过去 7 天历史天气与自定义日期查询。
- 新增温度/降雨/风速趋势曲线、动态穿衣指南和未来 2 小时风险卡片。
- 地图默认飞到所选城市，新增云图透明度控制、城市置顶保护、随缩放自适应风向标与阵风提示。
- 台风详情明确标注“中心位置估计”，降雨图例补充毫米含义，刷新策略调整为天气 15 分钟、台风 10 分钟、地图雷达 5 分钟检查。
- 文档补充卫星分辨率、云层处理、无云合成和真实风眼的数据边界。
