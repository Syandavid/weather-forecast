const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const insightContext = {window:{},Intl,Date};
vm.createContext(insightContext);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/weather-insights.js'),'utf8'),insightContext);
const wx = insightContext.window.WeatherInsights;
const now = Date.parse('2026-09-05T00:00:00Z');
const H = 3600000;
function fixture() {
  const times=Array.from({length:49},(_,i)=>new Date(now+i*H).toISOString().slice(0,16));
  const hourly={time:times};
  for(const [key,val] of Object.entries({temperature_2m:22,apparent_temperature:22,precipitation:0,precipitation_probability:10,wind_gusts_10m:3,weather_code:0,uv_index:2})) hourly[key]=times.map(()=>val);
  return {timezone:'UTC',utc_offset_seconds:0,current:{time:times[0]},hourly,daily:{time:['2026-09-05','2026-09-06'],sunrise:['2026-09-05T06:00','2026-09-06T06:00'],sunset:['2026-09-05T18:00','2026-09-06T18:00']}};
}
test('city time independent of device zone and DST offset on forecast date',()=>{
  assert.equal(wx.epoch('2026-09-05T08:00',{timezone:'Asia/Shanghai'}),now);
  assert.equal(wx.epoch('2026-09-04T20:00',{timezone:'America/New_York'}),now);
  assert.equal(wx.epoch('2026-11-02T08:00',{timezone:'America/New_York',utc_offset_seconds:-14400}),Date.parse('2026-11-02T13:00Z'));
});
test('expired current, missing horizon and null rain cannot claim no risk',()=>{
  const w=fixture(); assert.equal(wx.nextTwo(w,now+4*H).available,false);
  w.hourly.time=w.hourly.time.slice(0,2); assert.equal(wx.nextTwo(w,now).available,false);
  const n=fixture();n.hourly.precipitation[1]=null;assert.equal(wx.nextTwo(n,now).complete,false);
  assert.equal(wx.nextTwo(n,now).total,null);
});
test('two-hour rain is sum of intervals, not maximum or six display samples',()=>{
  const w=fixture();w.hourly.precipitation[1]=2;w.hourly.precipitation[2]=3;
  assert.equal(wx.nextTwo(w,now).total,5);
  assert.equal(wx.rainTotal(w.hourly,w,now+H/2,now+2*H,60),4);
  assert.equal(wx.sample(w.hourly,w,'precipitation',now+H/2),2);
});
test('15 minute short thunderstorm between card slots remains a risk',()=>{
  const w=fixture();const time=Array.from({length:9},(_,i)=>new Date(now+i*H/4).toISOString().slice(0,16));
  w.minutely_15={time,temperature_2m:time.map(()=>22),precipitation:time.map(()=>.25),weather_code:time.map(()=>0),wind_gusts_10m:time.map(()=>3)};
  w.minutely_15.weather_code[3]=95;
  const result=wx.nextTwo(w,now);assert.equal(result.minutes,15);assert.equal(result.total,2);assert.equal(result.storm,true);
  w.minutely_15.weather_code[3]=null;
  assert.equal(wx.nextTwo(w,now).complete,false);
});
test('expired minutely data falls back to covered hourly; no extrapolation',()=>{
  const w=fixture();w.minutely_15={time:['2026-09-04T00:00','2026-09-04T00:15'],precipitation:[0,0]};
  assert.equal(wx.nextTwo(w,now).minutes,60);
  assert.equal(wx.sample(w.hourly,w,'temperature_2m',now-1),null);
});
test('outdoor windows are daylight, disjoint, two hours and within 24h',()=>{
  const result=wx.outdoor(fixture(),'walk',now);assert.equal(result.windows.length,3);
  for(let i=0;i<result.windows.length;i++) {const w=result.windows[i];assert.equal(w.end-w.start,2*H);assert.ok(w.start>=now+6*H&&w.end<=now+18*H);if(i)assert.ok(w.start>=result.windows[i-1].end);}
});
test('outdoor avoids storms and missing data, activity thresholds differ',()=>{
  const w=fixture();w.hourly.wind_gusts_10m.fill(9);
  assert.ok(wx.outdoor(w,'walk',now).windows.length);assert.equal(wx.outdoor(w,'cycle',now).windows.length,0);
  w.hourly.weather_code.fill(95);assert.equal(wx.outdoor(w,'walk',now).windows.length,0);
  w.hourly.weather_code.fill(0);w.hourly.precipitation.fill(null);assert.equal(wx.outdoor(w,'walk',now).windows.length,0);
});
test('blank temperature does not become cold weather',()=>{
  const w=fixture();w.hourly.temperature_2m.fill(null);assert.equal(wx.sample(w.hourly,w,'temperature_2m',now),null);
});
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function func(name,next){return html.slice(html.indexOf('  async function '+name+'('),html.indexOf('  function '+next+'('));}
test('same map viewport coalesces concurrent requests; older viewport cannot overwrite newer',async()=>{
  let key='A',count=0;const pending=[];
  const state={satMap:{},metRequest:0,metLoadingKey:'',metRetryAt:0};
  const ctx={state,window:{L:{}},needsMet:()=>true,metBoundsKey:()=>key,sampleMetGrid:()=>[{lat:31,lon:121}],drawMetFields(){},updateCaption(){},updatePlayhead(){},getJson:()=>{count++;return new Promise(resolve=>pending.push(resolve));},Date};
  vm.createContext(ctx);vm.runInContext(func('loadMetGrid','scheduleMetGrid'),ctx);
  const a=ctx.loadMetGrid(false);await ctx.loadMetGrid(false);assert.equal(count,1);
  key='B';const b=ctx.loadMetGrid(false);assert.equal(count,2);
  pending[1]({current:{temperature_2m:20},hourly:{time:['2026-09-05T12:00']}});await b;
  pending[0]({current:{temperature_2m:99},hourly:{time:['2026-09-05T12:00']}});await a;
  assert.equal(state.metGrid.key,'B');assert.equal(state.metGrid.points[0].t,20);
});
test('hidden map fields make no request and failure backs off',async()=>{
  let need=false,count=0;
  const state={satMap:{},metRequest:0,metLoadingKey:'',metRetryAt:0};
  const ctx={state,window:{L:{}},needsMet:()=>need,metBoundsKey:()=> 'A',sampleMetGrid:()=>[{lat:31,lon:121}],drawMetFields(){},updateCaption(){},updatePlayhead(){},getJson:async()=>{count++;throw Error('429');},Date};
  vm.createContext(ctx);vm.runInContext(func('loadMetGrid','scheduleMetGrid'),ctx);
  await ctx.loadMetGrid(false);assert.equal(count,0);need=true;
  await ctx.loadMetGrid(false);await ctx.loadMetGrid(false);assert.equal(count,1);assert.equal(state.fcUnavailable,true);
});

test('radar metadata preserves current or selected forecast time instead of old index',async()=>{
  for(const kind of ['now','forecast']) {
    const selected={kind,time:kind==='now'?1000:2000};
    const state={radarIdx:0,timeline:[selected],radarMeta:{radar:{past:[]}}};
    const ctx={state,buildTimeline(){state.timeline=[{kind:'radar',time:500},{kind:'now',time:1000},{kind:'forecast',time:2000}];},snapPlayheadToNow(){state.radarIdx=state.timeline.findIndex(f=>f.kind==='now');},nearestFrame(frames,time){return frames.reduce((a,b)=>Math.abs(a.time-time)<Math.abs(b.time-time)?a:b);}};
    vm.createContext(ctx);vm.runInContext(func('loadRadarMeta','applySatOverlays'),ctx);
    await ctx.loadRadarMeta();
    assert.equal(state.timeline[state.radarIdx].kind,kind);
    assert.equal(state.timeline[state.radarIdx].time,selected.time);
  }
});

function modelContext(getJson) {
  const nodes={modelCompare:{open:true},modelResults:{innerHTML:'',insertAdjacentHTML(pos,html){this.innerHTML+=html;}},modelRetry:{disabled:false}};
  const state={city:{lat:31,lon:121},modelRequest:0};
  const ctx={state,$:id=>nodes[id],cityKey:c=>c.lat+','+c.lon,getJson,Date};
  vm.createContext(ctx);vm.runInContext(func('loadModelComparison','clothingGuide'),ctx);
  return {ctx,nodes,state};
}
const modelDaily={daily:{time:['2026-09-05'],temperature_2m_max:[25],precipitation_sum:[1]}};
test('model comparison is lazy and recovers partial and malformed results without inventing values',async()=>{
  let count=0;
  const {ctx,nodes}=modelContext(async url=>{count++;if(url.includes('gfs_'))throw Error('network');if(url.includes('icon_'))return {daily:{time:['2026-09-05']}};return modelDaily;});
  nodes.modelCompare.open=false;await ctx.loadModelComparison(false);assert.equal(count,0);
  nodes.modelCompare.open=true;await ctx.loadModelComparison(false);
  assert.equal(count,3);assert.equal(nodes.modelRetry.disabled,false);
  assert.match(nodes.modelResults.innerHTML,/ECMWF/);assert.match(nodes.modelResults.innerHTML,/暂缺/);
  assert.match(nodes.modelResults.innerHTML,/可用模型不足/);assert.doesNotMatch(nodes.modelResults.innerHTML,/NaN|undefined/);
  await ctx.loadModelComparison(false);assert.equal(count,3);
});
test('a model response from the previous city cannot replace the current city',async()=>{
  const pending=[];
  const {ctx,nodes,state}=modelContext(()=>new Promise(resolve=>pending.push(resolve)));
  const a=ctx.loadModelComparison(false);await ctx.loadModelComparison(false);assert.equal(pending.length,3);
  state.city={lat:40,lon:-74};state.modelRequest++;state.modelLoadingKey='';
  const b=ctx.loadModelComparison(false);assert.equal(pending.length,6);
  pending.slice(3).forEach(resolve=>resolve({daily:{time:['2026-09-05'],temperature_2m_max:[30],precipitation_sum:[0]}}));await b;
  const current=nodes.modelResults.innerHTML;
  pending.slice(0,3).forEach(resolve=>resolve(modelDaily));await a;
  assert.equal(nodes.modelResults.innerHTML,current);assert.match(current,/30°/);
});
