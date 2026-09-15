const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const ctx = {URLSearchParams}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/city-search.js'), 'utf8'), ctx);
const city = ctx.CitySearch;
const row = (id, name, country='GB') => ({id, name, country_code:country, country, latitude:id, longitude:-0.12, timezone:'Europe/London'});
test('coordinates cover either hemisphere, full-width punctuation and reject invalid ranges', () => {
  for (const q of ['-33.8688,151.2093', '０，０', '+90, -180']) {
    const result=city.coordinates(q); assert.ok(Number.isFinite(result.lat)); assert.ok(!result.error);
  }
  for (const q of ['91,0', '0,181', ',20', '20,', '1,2,3', '1..2,3']) assert.ok(city.coordinates(q).error);
  assert.equal(city.coordinates('Paris, France'), null);
});
test('common translated aliases expand queries without dropping original matches or qualifiers', () => {
  const plans = city.plans('东京');
  const first = new URL(plans[0].url);
  assert.equal(first.searchParams.get('name'), 'Tokyo');
  assert.equal(first.searchParams.get('countryCode'), 'JP');
  assert.ok(plans.some(p=>new URL(p.url).searchParams.get('name')==='东京'));
  assert.equal(new URL(city.plans('伦敦, 加拿大')[0].url).searchParams.get('name'), 'London, 加拿大');
  assert.equal(new URL(city.plans('Paris，France')[0].url).searchParams.get('name'), 'Paris,France');
});
test('language results merge by location ID, preserve same-name places and prefer Chinese inside China', () => {
  const rows = city.merge([{language:'zh',results:[row(1,'伦敦'),row(2,'伦敦','CA'),row(3,'杭州','CN')]}, {language:'en',results:[row(1,'London'),row(3,'Hangzhou','CN'),row(4,'Sydney','AU')]}]);
  assert.equal(rows.length,4); assert.equal(rows[0].name,'London'); assert.equal(rows[2].name,'杭州');
  assert.notEqual(city.key(rows[0]),city.key(rows[1]));
});
test('English queries retain English provider ranking rather than a translated namesake', async () => {
  let state;
  const search=city.create({getJson:async url=>new URL(url).searchParams.get('language')==='en'
    ? {results:[row(1,'New York','US'),row(2,'York','US')]}
    : {results:[row(2,'约克','US'),row(1,'纽约市','US')]},onUpdate:s=>{state=s;}});
  await search.search('New York, United States');
  assert.equal(state.rows[0].name,'New York');
});
test('partial failure still returns usable search matches and a retry hint', async () => {
  const updates=[];
  const search=city.create({getJson:async url=>{if(new URL(url).searchParams.get('language')==='zh')throw Error('offline'); return {results:[row(1,'London')]};},onUpdate:s=>updates.push(s)});
  await search.search('London');
  const last=updates.at(-1); assert.equal(last.rows[0].name,'London'); assert.equal(last.retry,true); assert.equal(last.loading,false);
});
test('input invalidation blocks stale results; valid coordinates bypass geocoding', async () => {
  const pending=[], updates=[];
  const search=city.create({getJson:()=>new Promise(resolve=>pending.push(resolve)),onUpdate:s=>updates.push(s)});
  const old=search.search('London'); search.cancel();
  await search.search('0,0');
  const count=updates.length;
  pending.forEach(resolve=>resolve({results:[row(1,'London')]})); await old;
  assert.equal(updates.length,count); assert.equal(updates.at(-1).rows[0].lat,0);
  assert.equal(pending.length,2);
});
test('search cache avoids repeat calls; empty and failed results are not falsely cached', async () => {
  let calls=0, clock=100;
  const updates=[], search=city.create({now:()=>clock,getJson:async()=>{calls++;return {results:[row(1,'London')]};},onUpdate:s=>updates.push(s)});
  await search.search('London'); await search.search('london'); assert.equal(calls,2);
  clock+=600001; await search.search('London'); assert.equal(calls,4);
  await search.search('L'); assert.equal(calls,4); assert.equal(updates.at(-1).rows.length,0);
});
