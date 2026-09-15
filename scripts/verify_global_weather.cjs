// Explicit online smoke check (not run by CI): node scripts/verify_global_weather.cjs
// Uses the shipped search controller and the app's complete forecast query.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), context = {URLSearchParams};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/city-search.js'), 'utf8'), context);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const query = html.match(/const q = "latitude=" \+ c.lat[^;]+;\s*const wurl = [\s\S]*?;/);
assert.ok(query, 'App forecast query must be found');
async function getJson(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(20000), cache:'no-store'});
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
const places = [
  ['杭州', 'CN', 'Asia/Shanghai'], ['东京', 'JP', 'Asia/Tokyo'], ['London, United Kingdom', 'GB', 'Europe/London'],
  ['New York, United States', 'US', 'America/New_York'], ['内罗毕', 'KE', 'Africa/Nairobi'],
  ['São Paulo, Brazil', 'BR', 'America/Sao_Paulo'], ['Sydney, Australia', 'AU', 'Australia/Sydney']
];
async function check([q, country, zone]) {
  let state;
  const search = context.CitySearch.create({getJson, onUpdate:s=>{state=s;}});
  await search.search(q);
  const city = state.rows.find(r=>r.country_code===country);
  assert.ok(city, q + ': expected country not found: ' + state.message);
  assert.equal(city.timezone, zone, q + ': selected a distant namesake');
  const url = vm.runInNewContext(query[0] + '\nwurl;', {c:city});
  const weather = await getJson(url);
  assert.ok(!weather.error, weather.reason);
  assert.ok(Number.isFinite(weather.current?.temperature_2m), q + ': no current temperature');
  assert.equal(weather.daily?.time?.length, 16, q + ': expected 16-day forecast');
  assert.ok(weather.hourly?.time?.length >= 24, q + ': no hourly forecast');
  assert.equal(weather.timezone, zone, q + ': wrong local timezone');
  console.log(JSON.stringify({query:q, city:city.name, country, latitude:city.lat, longitude:city.lon, timezone:weather.timezone, time:weather.current.time, temperature:weather.current.temperature_2m, days:weather.daily.time.length}));
}
(async()=>{
  // Bound concurrency and request count on the free public endpoints.
  for (let i=0;i<places.length;i+=2) await Promise.all(places.slice(i,i+2).map(check));
  console.log('PASS: 7 global locations returned live search + current + hourly + 16-day data');
})().catch(e=>{console.error(e); process.exitCode=1;});
