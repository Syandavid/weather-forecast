# 天气预报

卫星云图、台风路径和城市天气的静态网页应用。用浏览器直接打开即可；也可以加到主屏幕，像小程序一样全屏使用。不需要账号，也不需要 API 密钥。

当前功能：全球城市搜索、当前位置天气、24 小时与 7 天预报、空气质量、生活指数、卫星云图、雷达回放、温度/湿度/风/气压图层、CMA 与 NHC 台风路径、台风风圈与预报锥、预警列表。天气和台风数据支持手动刷新，并在页面保持打开时每 30 分钟自动刷新。

线上地址：https://syan1209david-droid.github.io/weather-forecast/

## 本地预览

在仓库目录启动静态文件服务（端口 8080），再用浏览器打开本机该端口。不要用 file 协议打开，否则无法注册 Service Worker。

## 加到主屏幕

iPhone：用 Safari 打开（不要用微信内置浏览器），底部分享，选添加到主屏幕。从主屏幕点「天气预报」即全屏独立窗口。

Android：Chrome 打开后，菜单里选添加到主屏幕或安装应用。

电脑：Chrome 或 Edge 可安装为独立窗口。宽屏是侧栏加内容，卫星和台风页提供完整地图。

## GitHub Pages

按 main 分支根目录发布。仓库 Settings 的 Pages 中选择 Deploy from a branch，分支 main，目录为根目录。

## 数据来源（全部公开、无密钥）

- 天气与预报：Open-Meteo Forecast
- 城市搜索：Open-Meteo Geocoding
- 空气质量：Open-Meteo Air Quality
- 真实色卫星：NASA GIBS（VIIRS / MODIS True Color）
- 东亚可见光与红外：NASA GIBS（Himawari AHI）
- 雷达：RainViewer
- 西北太平洋台风：中央气象台 CMA
- 大西洋与东北太平洋：美国飓风中心 NHC
- 台风页底图：Esri Canvas World Dark Gray（无密钥；若不可用则 OSM 加深）

预警页优先列出在编台风，再根据气温、降水、大风、低温、大雾阈值生成本地提示。没有生效项目时显示「目前没有生效预警」。

## 台风快照

浏览器先请求 CMA 与 NHC 实时数据；若被网络拦截，则回退到仓库内快照文件。定时工作流每半小时抓取一次并提交。也可手动运行该工作流。

## 文件

页面与逻辑都在 index.html，无打包。另有 PWA 清单、Service Worker、图标、台风快照、抓取脚本，以及 .nojekyll。

无需安装依赖，无需构建。

台风快照工作流位于 `.github/workflows/update-typhoons.yml`，每 30 分钟抓取 CMA 与 NHC 数据并在有变化时提交 `data/typhoons.json`；也可以在 GitHub Actions 页面手动运行。

