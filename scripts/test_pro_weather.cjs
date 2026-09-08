const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const ctx = {URLSearchParams}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pro-weather.js'), 'utf8'), ctx);
const pro = ctx.ProWeather;
function harness() {
  const frames = [], timers = new Map(); let city = {name:'广州',lat:23.12911,lon:113.26438}, seq = 0;
  const status = {}, place = {}, external = {removeAttribute(k){delete this[k];}}, retry = {addEventListener(k,fn){this[k]=fn;}};
  const doc = {createElement(tag){return {tag, events:{}, attrs:{}, addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},remove(){this.removed=true;}};}};
  const clock = {setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);}};
  const controller = pro.create({host:{appendChild(f){frames.push(f);}}, status, place, external, retry, getCity:()=>city, doc, clock});
  return {controller, frames, timers, status, place, external, retry, city(c){city=c;}};
}
test('official embed URL defaults to rain and sends only approximate coordinates', () => {
  const u = new URL(pro.embedUrl({lat:23.12911,lon:113.26438}));
  assert.equal(u.origin, 'https://embed.windy.com'); assert.equal(u.pathname, '/embed.html');
  assert.equal(u.searchParams.get('overlay'), 'rain'); assert.equal(u.searchParams.get('product'), 'ecmwf');
  assert.equal(u.searchParams.get('lat'), '23.1'); assert.equal(u.searchParams.get('lon'), '113.3');
  assert.equal(u.searchParams.get('metricRain'), 'mm');
  assert.equal(u.searchParams.has('timestamp'), false); assert.equal(u.searchParams.has('appid'), false);
  for (const c of [null,{}, {lat:null,lon:10}, {lat:Infinity,lon:0},{lat:91,lon:0},{lat:20,lon:181},{lat:'bad',lon:0}]) assert.equal(pro.embedUrl(c), null);
  assert.ok(pro.embedUrl({lat:0,lon:0}));
});
test('lazy iframe; unrelated sync keeps its timeline; leaving releases resources', () => {
  const h=harness(); h.controller.sync(); assert.equal(h.frames.length,0);
  h.controller.setActive(true); assert.equal(h.frames.length,1); assert.equal(h.place.textContent,'广州附近');
  assert.equal(h.frames[0].referrerPolicy,'no-referrer'); assert.match(h.frames[0].attrs.allow,/geolocation 'none'/);
  h.controller.setActive(true); assert.equal(h.frames.length,1);
  h.controller.setActive(false); assert.equal(h.frames[0].removed,true); assert.equal(h.timers.size,0);
  h.controller.setActive(true); assert.equal(h.frames.length,2);
});
test('city changes and explicit retries replace iframe; stale callbacks cannot report status', () => {
  const h=harness(); h.controller.setActive(true); const old=h.frames[0];
  h.city({name:'上海',lat:31.23,lon:121.47}); h.controller.sync();
  assert.equal(old.removed,true); assert.equal(h.frames.length,2); assert.equal(h.place.textContent,'上海附近');
  old.events.load(); assert.equal(h.status.textContent,'正在连接 Windy…');
  h.frames[1].events.load(); assert.match(h.status.textContent,/若空白/); assert.equal(h.timers.size,0);
  h.retry.click(); assert.equal(h.frames.length,3); assert.equal(h.frames[1].removed,true);
  for(const fn of h.timers.values())fn(); assert.match(h.status.textContent,/连接较慢/);
  h.frames[2].events.error(); assert.match(h.status.textContent,/连接未完成/);
  h.city({}); h.controller.sync(); assert.equal(h.frames[2].removed,true); assert.equal(h.external.href,undefined);
});
test('standalone mode keeps native map and clearly separates controls and data', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/data-view="pro"/); assert.match(html,/data-view="2d"/); assert.match(html,/data-view="3d"/);
  assert.match(html,/view-pro \.sat-hud > :not\(\.sat-view-switch\)/);
  assert.match(html,/原地图的路线、边界和时间不在此同步/);
  assert.match(html,/if \(next === "pro"\) stopRadarLoop\(\)/);
  assert.match(html,/if \(request !== satViewRequest\) return/);
});
test('service worker never intercepts external iframe navigations or caches Windy', () => {
  const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'); const handlers={};
  const c={URL,self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn}};
  vm.createContext(c);vm.runInContext(sw,c);
  let intercepted=false;
  handlers.fetch({request:{method:'GET',mode:'navigate',destination:'document',url:'https://embed.windy.com/embed.html'},respondWith(){intercepted=true;}});
  assert.equal(intercepted,false);
  assert.match(sw,/pro-weather\.js\?v=28/);
});
