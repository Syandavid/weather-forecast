const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/map-weather.js'),'utf8'),ctx);
const mw=ctx.window.MapWeather, html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function source(name,next){return html.slice(html.indexOf('  function '+name+'('),html.indexOf('  function '+next+'('));}
test('infrared historical frames change, latest has latency, no future satellite',()=>{
 const now=Date.parse('2026-09-05T12:00Z')/1000;
 assert.equal(mw.satelliteStamp('infrared',now-7200,now),'2026-09-05T10:00:00Z');
 assert.equal(mw.satelliteStamp('infrared',now-6600,now),'2026-09-05T10:10:00Z');
 assert.equal(mw.satelliteStamp('infrared',now,now),'2026-09-05T11:10:00Z');
 assert.equal(mw.satelliteStamp('infrared',now+3600,now),null);
 assert.equal(mw.satelliteStamp('truecolor',now,now),'2026-09-05');
});
test('forecast pixels change with cloud and precipitation values; toggles and nulls are respected',()=>{
 const grid=v=>[[v,v],[v,v]], bounds={south:20,north:25};
 const dry=mw.raster(grid({cloud:0,mm:0}),8,8,bounds,true,true);
 const wet=mw.raster(grid({cloud:95,mm:4}),8,8,bounds,true,true);
 assert.notDeepEqual(Array.from(dry.pixels),Array.from(wet.pixels));
 assert.equal(dry.known,64);assert.equal(dry.pixels[3],0);assert.ok(wet.pixels[3]>100);
 const unknown=mw.raster(grid({cloud:null,mm:null}),8,8,bounds,true,true);assert.equal(unknown.known,0);assert.equal(unknown.pixels[3],0);
 const off=mw.raster(grid({cloud:95,mm:4}),8,8,bounds,false,false);assert.equal(off.pixels[3],0);
 const rainOnly=mw.raster(grid({cloud:95,mm:0}),8,8,bounds,false,true);assert.equal(rainOnly.pixels[3],0);
});
test('default radar switch alone requests future weather, not only separate precipitation switch',()=>{
 let future=true;const on={radar:true,precip:false,cloud:false};
 const c={ov:k=>!!on[k],playheadIsFuture:()=>future};vm.createContext(c);vm.runInContext(source('needsMet','metBoundsKey'),c);
 assert.equal(c.needsMet(),true);future=false;assert.equal(c.needsMet(),false);
 future=true;on.radar=false;assert.equal(c.needsMet(),false);on.cloud=true;assert.equal(c.needsMet(),true);
});
test('forecast missing hour never falls back to current weather',()=>{
 const c={hourIndex:()=>-1};vm.createContext(c);vm.runInContext(source('metAt','updateCaption'),c);
 assert.equal(c.metAt({t:20,mm:10,hourly:{}},99,true).mm,null);
});
test('timeline changes radar URL, draws forecast on each frame and restores observation on return',()=>{
 const frames=[{time:100,kind:'radar'},{time:200,kind:'now'},{time:300,kind:'forecast'},{time:400,kind:'forecast'}];
 let url='',draws=0,loads=0,syncs=0,applies=0;
 const state={satMap:{},radarIdx:0,radarFrames:[{time:100,url:'past.png'},{time:200,url:'now.png'}],precipFrames:[],satRadarLayer:{setUrl:u=>url=u}};
 const c={state,playFrames:()=>frames,playheadIsFuture:()=>frames[state.radarIdx].kind==='forecast',syncSatelliteTime:()=>syncs++,drawMetFields:()=>draws++,loadMetGrid:()=>loads++,updatePlayhead(){},applySatOverlays:()=>applies++,nearestFrame:(a,t)=>a.find(f=>f.time===t)};
 vm.createContext(c);vm.runInContext(source('showRadarFrame','schedulePlayTick'),c);
 c.showRadarFrame(1);assert.equal(url,'now.png');c.showRadarFrame(2);c.showRadarFrame(3);c.showRadarFrame(0);
 assert.equal(draws,4);assert.equal(syncs,4);assert.equal(loads,3);assert.equal(applies,2);
});
test('satellite controller updates actual tile URL and hides observation for future',()=>{
 const now=Date.now()/1000;let fr={time:now-7200},future=false,url='',opacity=1;
 const layer={weatherKind:'infrared',weatherTemplate:'https://example.test/default/{time}/tiles',setUrl:u=>url=u,setOpacity:o=>opacity=o};
 const state={satLayer:'city',satHdOverlayObj:layer,satOp:.5};
 const c={state,window:{MapWeather:mw},playheadFrame:()=>fr,playheadIsFuture:()=>future,ensureSatFallback(){}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('  function syncSatelliteTime('),html.indexOf('  async function setSatHdOverlay(')),c);
 c.syncSatelliteTime();const first=url;fr={time:now-6600};c.syncSatelliteTime();assert.notEqual(url,first);
 future=true;c.syncSatelliteTime();assert.equal(opacity,0);future=false;c.syncSatelliteTime();assert.equal(opacity,.5);
});

test('sample grid stays rectangular and inside the actual high-zoom viewport',()=>{
 for(const area of [{south:23.1,north:23.101,west:113.2,east:113.201,zoom:19},{south:-85,north:85,west:-180,east:180,zoom:2}]) {
  const bounds={pad(){return this;},getSouth:()=>area.south,getNorth:()=>area.north,getWest:()=>area.west,getEast:()=>area.east};
  const c={state:{satMap:{getBounds:()=>bounds,getZoom:()=>area.zoom}}};vm.createContext(c);vm.runInContext(source('sampleMetGrid','tempColor'),c);
  const pts=c.sampleMetGrid(),rows=1+Math.max(...pts.map(p=>p.row)),cols=1+Math.max(...pts.map(p=>p.col));
  assert.equal(pts.length,rows*cols);assert.ok(pts.length<=96);
  assert.ok(pts.every(p=>p.lat>=area.south-1e-8&&p.lat<=area.north+1e-8&&p.lon>=area.west-1e-8&&p.lon<=area.east+1e-8));
 }
});
test('city-detail panning gets a new viewport cache key',()=>{
 let lon=113.2;const bounds={getSouth:()=>23.1,getNorth:()=>23.101,getWest:()=>lon,getEast:()=>lon+.001};
 const c={state:{satMap:{getBounds:()=>bounds,getZoom:()=>19}}};vm.createContext(c);vm.runInContext(source('metBoundsKey','sampleMetGrid'),c);
 const first=c.metBoundsKey();lon+=.002;assert.notEqual(c.metBoundsKey(),first);
});

test('rain color and alpha are continuous across former hard thresholds',()=>{
 const color=mm=>{const v={cloud:0,mm},g=[[v,v],[v,v]];return mw.raster(g,2,2,{south:20,north:21},false,true).pixels.slice(0,4);};
 for(const threshold of [.08,.5,2,6,15]){
  const a=color(threshold-.001),b=color(threshold+.001);
  for(let k=0;k<4;k++)assert.ok(Math.abs(a[k]-b[k])<=3,`jump at ${threshold}, channel ${k}`);
 }
 assert.equal(color(0)[3],0);assert.ok(color(4)[3]>color(.2)[3]);
});
test('responsive raster is much finer than 96px while respecting pixel and aspect budgets',()=>{
 for(const [w,h,dpr] of [[1280,720,1],[390,740,3],[2560,1440,2]]){
  const s=mw.renderSize(w,h,dpr);assert.ok(s.width>300&&s.height>300);
  assert.ok(s.width*s.height<=400000);assert.ok(Math.max(s.width,s.height)<=1024);
  assert.ok(Math.abs(s.width/s.height-w/h)<.01);
 }
});
test('regional viewport uses denser samples without exceeding existing request limit',()=>{
 const bounds={pad(){return this;},getSouth:()=>28,getNorth:()=>33,getWest:()=>118,getEast:()=>124};
 const c={state:{satMap:{getBounds:()=>bounds,getZoom:()=>6}}};vm.createContext(c);vm.runInContext(source('sampleMetGrid','tempColor'),c);
 const pts=c.sampleMetGrid();assert.ok(pts.length>=49&&pts.length<=81);assert.equal(pts.length,(1+Math.max(...pts.map(p=>p.row)))*(1+Math.max(...pts.map(p=>p.col))));
});

test('worker returns transferable raster pixels and echoes the request ID',()=>{
 let posted;const self={MapWeather:mw,postMessage:r=>posted=r};
 const c={self,importScripts(){},performance:{now:()=>0}};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/map-weather-worker.js'),'utf8'),c);
 const v={cloud:50,mm:1};self.onmessage({data:{id:7,grid:[[v,v],[v,v]],width:8,height:8,bounds:{south:20,north:21},clouds:true,rain:true}});
 assert.equal(posted.id,7);assert.equal(posted.known,64);assert.equal(posted.pixels.length,256);
 self.onmessage({data:{id:8,grid:null}});assert.equal(posted.id,8);assert.equal(posted.error,true);
});
test('worker completions cannot overwrite a newer viewport and keep a bounded cache',()=>{
 const data={},cache=new Map();let draws=0;
 const state={metGrid:data,forecastRenderCache:cache};
 const c={state,performance:{now:()=>0},drawMetFields(){draws++;},updateCaption(){}};vm.createContext(c);vm.runInContext(source('finishForecastRender','startForecastRender'),c);
 for(let i=0;i<12;i++){state.forecastRenderJob={id:i,key:String(i),data};c.finishForecastRender({id:i,known:0,ms:10});}
 assert.equal(cache.size,8);assert.ok(!cache.has('0'));
 state.forecastRenderJob={id:99,key:'old',data:{}};c.finishForecastRender({id:99,known:0,ms:10});assert.ok(!cache.has('old'));
 state.forecastRenderJob={id:100,key:'current',data};c.finishForecastRender({id:99,known:0,ms:10});assert.equal(state.forecastRenderJob.id,100);assert.equal(draws,13);
});

test('shape-preserving refinement keeps source nodes and does not invent rain extremes or fill gaps',()=>{
 const g=[[{cloud:0,mm:0},{cloud:70,mm:2},{cloud:100,mm:0}],[{cloud:50,mm:1},{cloud:100,mm:4},{cloud:20,mm:1}]];
 const r=mw.refineGrid(g);assert.equal(r.length,5);assert.equal(r[0].length,9);
 for(let y=0;y<g.length;y++)for(let x=0;x<g[0].length;x++){assert.equal(r[y*4][x*4].mm,g[y][x].mm);assert.equal(r[y*4][x*4].cloud,g[y][x].cloud);}
 assert.ok(r.flat().every(v=>v.mm>=0&&v.mm<=4&&v.cloud>=0&&v.cloud<=100));
 g[0][1].mm=null;const missing=mw.refineGrid(g);assert.equal(missing[0][2].mm,null);assert.equal(missing[0][4].mm,null);
});

test('worker encodes offscreen when available instead of sending work back to UI',async()=>{
 let posted;const self={MapWeather:mw,postMessage:r=>posted=r};
 class Canvas {getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};}async convertToBlob(){return {};}}
 class Reader {readAsDataURL(){return 'data:image/png;base64,fixture';}}
 const c={self,OffscreenCanvas:Canvas,FileReaderSync:Reader,importScripts(){},performance:{now:()=>0}};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/map-weather-worker.js'),'utf8'),c);
 const v={cloud:50,mm:1};await self.onmessage({data:{id:9,grid:[[v,v],[v,v]],width:8,height:8,bounds:{south:20,north:21},clouds:true,rain:true}});
 assert.equal(posted.url,'data:image/png;base64,fixture');assert.equal(posted.pixels,undefined);assert.equal(posted.id,9);
});
