# Changelog

## [Unreleased]

- Keep the weather PWA and scheduled typhoon snapshot workflow maintainable.
- Add offline integrity checks for the manifest, snapshot and updater script.

## [0.1.0] - 2026-08-30

- Initial public PWA with city weather, forecast, air quality, satellite,
  radar, typhoon tracks and local alerts.
# 2026-08-30

- 高清城市底图解除 9 级缩放限制，支持 10 级以上、最高约 19 级放大。
- 新增 Esri 高清城市底图模式，支持城市级放大查看；放大地图时自动提高天气场网格密度。
- 天气预报扩展至 16 天，新增过去 7 天历史天气与自定义日期查询。
- 新增温度/降雨/风速趋势曲线、动态穿衣指南和未来 2 小时风险卡片。
- 地图默认飞到所选城市，新增云图透明度控制、城市置顶保护、随缩放自适应风向标与阵风提示。
- 台风详情明确标注“中心位置估计”，降雨图例补充毫米含义，刷新策略调整为天气 15 分钟、台风 10 分钟、地图雷达 5 分钟检查。
- 文档补充卫星分辨率、云层处理、无云合成和真实风眼的数据边界。
