(function (root) {
  'use strict';
  // Official generator: https://embed.windy.com/config/map . No API key,
  // private tiles, cross-origin inspection, or unsupported postMessage API.
  function embedUrl(city) {
    const lat = Number(city && city.lat), lon = Number(city && city.lon);
    if (!city || city.lat == null || city.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    // Region-level context only; never forward precise GPS/map-pick coordinates.
    const params = new URLSearchParams({type:'map', location:'coordinates', metricRain:'mm', metricTemp:'°C', metricWind:'km/h', zoom:'6', overlay:'rain', product:'ecmwf', level:'surface', lat:lat.toFixed(1), lon:lon.toFixed(1)});
    return 'https://embed.windy.com/embed.html?' + params.toString();
  }
  function create({host, status, place, external, retry, getCity, doc = document, clock = window}) {
    let active = false, frame = null, timer = null, currentUrl = null, generation = 0;
    function cancelTimer() { if (timer != null) clock.clearTimeout(timer); timer = null; }
    function release() {
      generation++;
      cancelTimer();
      if (frame) frame.remove();
      frame = null; currentUrl = null;
    }
    function sync(force) {
      if (!active) return;
      const city = getCity(), url = embedUrl(city);
      place.textContent = city && city.name ? city.name + '附近' : '所选城市附近';
      if (!url) {
        release(); external.removeAttribute('href');
        status.textContent = '请先选择一个有效城市，再打开专业云雨。';
        return;
      }
      external.href = url;
      if (!force && frame && currentUrl === url) return;
      release(); currentUrl = url;
      status.textContent = '正在连接 Windy…';
      const request = generation;
      const next = doc.createElement('iframe');
      next.title = 'Windy 专业云雨地图';
      next.referrerPolicy = 'no-referrer';
      next.setAttribute('allow', "geolocation 'none'; camera 'none'; microphone 'none'");
      next.addEventListener('load', function () {
        if (request !== generation) return;
        // An iframe load event does not establish that its weather tiles loaded.
        cancelTimer();
        status.textContent = '在图内选择云 / 雨、雷暴，拖动底部时间轴。若空白，可重新加载或单独打开。';
      });
      next.addEventListener('error', function () {
        if (request !== generation) return;
        cancelTimer(); status.textContent = '连接未完成，请重新加载或单独打开。';
      });
      frame = next; next.src = url; host.appendChild(next);
      timer = clock.setTimeout(function () {
        if (request !== generation) return;
        status.textContent = '连接较慢；若地图仍空白，请重新加载或单独打开。';
      }, 18000);
    }
    retry.addEventListener('click', function () { sync(true); });
    return {
      setActive(value) { active = !!value; if (active) sync(false); else release(); },
      sync
    };
  }
  root.ProWeather = {embedUrl, create};
})(typeof window !== 'undefined' ? window : globalThis);
