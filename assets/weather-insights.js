(function (root) {
  'use strict';
  const HOUR = 3600000;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const timeCache = new Map();
  // Open-Meteo ISO values are city-local wall times, not browser-local times.
  function epoch(iso, w) {
    if (!iso) return NaN;
    if (/Z$|[+-]\d\d:\d\d$/.test(iso)) return Date.parse(iso);
    const key = [iso, w && w.timezone, w && w.utc_offset_seconds].join('|');
    if (timeCache.has(key)) return timeCache.get(key);
    const wall = Date.parse(iso + 'Z');
    let result = wall - ((w && w.utc_offset_seconds) || 0) * 1000;
    try {
      if (w && w.timezone) {
        const fmt = new Intl.DateTimeFormat('en-CA', {timeZone:w.timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
        for (let i=0;i<3;i++) {
          const p = {};
          fmt.formatToParts(new Date(result)).forEach(x => {p[x.type]=x.value;});
          const actualWall = Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
          const delta = wall-actualWall;
          result += delta;
          if (!delta) break;
        }
      }
    } catch (_) {}
    if (timeCache.size > 12000) timeCache.clear();
    timeCache.set(key,result);
    return result;
  }
  function freshness(w, now=Date.now()) {
    const stamp = epoch(w && w.current && w.current.time,w);
    const age = (now-stamp)/HOUR;
    return {age, stale:!Number.isFinite(age) || age>3 || age< -1};
  }
  function covers(obj,w,start,end) {
    const t=obj && obj.time || [];
    return t.length>1 && epoch(t[0],w)<=start && epoch(t[t.length-1],w)>=end;
  }
  function sample(obj,w,field,target) {
    const t=obj.time || [], v=obj[field] || [];
    if (!covers(obj,w,target,target)) return null;
    let r=t.findIndex(x => epoch(x,w)>=target);
    const l=Math.max(0,r-1);
    if (r<0 || !finite(v[r])) return null;
    // Precipitation is an interval total; categorical weather codes must not
    // be numerically interpolated. Nulls must never become clear weather.
    if (field==='precipitation' || field==='weather_code') return v[r];
    if (epoch(t[r],w)===target) return v[r];
    if (!finite(v[l])) return null;
    const span=epoch(t[r],w)-epoch(t[l],w);
    return span ? v[l]+(v[r]-v[l])*(target-epoch(t[l],w))/span : v[r];
  }
  function rainTotal(obj,w,start,end,minutes) {
    const times=obj.time || [], values=obj.precipitation || [];
    let total=0, covered=0;
    for (let i=0;i<times.length;i++) {
      const stop=epoch(times[i],w), begin=stop-minutes*60000;
      const overlap=Math.max(0,Math.min(stop,end)-Math.max(begin,start));
      if (!overlap) continue;
      if (!finite(values[i])) return null;
      total+=values[i]*overlap/(minutes*60000); covered+=overlap;
    }
    return covered>=end-start-1 ? total : null;
  }
  function nextTwo(w,now=Date.now()) {
    if (!w || freshness(w,now).stale) return {available:false,reason:'天气数据已过期，更新后再查看短临风险'};
    const end=now+2*HOUR, hourly=w.hourly||{};
    const minute=w.minutely_15||{};
    const minutes=covers(minute,w,now,end) && rainTotal(minute,w,now,end,15)!==null ? 15 : 60;
    const source=minutes===15 ? minute : hourly;
    if (!covers(source,w,now,end)) return {available:false,reason:'预报未覆盖未来两小时，暂无法判断风险'};
    const rows=[10,15,30,60,90,120].map(offset => {
      const target=now+offset*60000;
      return {offset, temp:sample(source,w,'temperature_2m',target),pop:sample(hourly,w,'precipitation_probability',target),mm:sample(source,w,'precipitation',target),code:sample(source,w,'weather_code',target),gust:sample(source,w,'wind_gusts_10m',target)};
    });
    const total=rainTotal(source,w,now,end,minutes);
    const values=(field)=>rows.map(r=>r[field]).filter(finite);
    const peak=field=>values(field).length ? Math.max(...values(field)) : null;
    // Include every source interval, so a brief storm between display slots
    // cannot disappear just because the six cards did not sample it.
    const intervalRows=(source.time||[]).map((t,i)=>({time:epoch(t,w),code:(source.weather_code||[])[i],gust:(source.wind_gusts_10m||[])[i]})).filter(r=>r.time>now && r.time-minutes*60000<end);
    const storm=intervalRows.some(r=>r.code>=95);
    const gusts=intervalRows.map(r=>r.gust).filter(finite);
    const maxGust=gusts.length ? Math.max(...gusts) : peak('gust');
    const complete=total!==null && rows.every(r=>finite(r.code)&&finite(r.gust)&&finite(r.mm)) && intervalRows.every(r=>finite(r.code)&&finite(r.gust));
    return {available:true,rows,minutes,total,complete,storm,maxGust,maxPop:peak('pop'),maxMm:peak('mm')};
  }
  const activities={walk:{name:'散步',min:5,max:32,gust:12,uv:8},run:{name:'跑步',min:5,max:28,gust:10,uv:6},cycle:{name:'骑行',min:5,max:30,gust:8,uv:7}};
  function outdoor(w,activity='walk',now=Date.now()) {
    if (!w || freshness(w,now).stale) return {available:false,reason:'等待新鲜天气数据后推荐出行时段'};
    const cfg=activities[activity]||activities.walk, h=w.hourly||{}, times=h.time||[], reasons=new Map(), candidates=[];
    const issue=i=>{
      const get=k=>(h[k]||[])[i];
      if (!['temperature_2m','apparent_temperature','precipitation','precipitation_probability','wind_gusts_10m','weather_code','uv_index'].every(k=>finite(get(k)))) return '数据不完整';
      if (get('weather_code')>=95) return '雷暴风险';
      if ([66,67,71,73,75,77,85,86].includes(get('weather_code'))) return '雨雪或结冰风险';
      if (get('precipitation')>=0.2 || get('precipitation_probability')>=40) return '降水风险';
      if (get('wind_gusts_10m')>=cfg.gust) return '阵风偏强';
      if (get('apparent_temperature')<cfg.min || get('apparent_temperature')>cfg.max) return '体感不舒适';
      if (get('uv_index')>=cfg.uv) return '紫外线偏强';
      const day=times[i].slice(0,10), di=(w.daily && w.daily.time||[]).indexOf(day);
      const rise=epoch((w.daily && w.daily.sunrise||[])[di],w), set=epoch((w.daily && w.daily.sunset||[])[di],w);
      if (!Number.isFinite(rise)||!Number.isFinite(set)) return '日照数据不足';
      const time=epoch(times[i],w);
      if (time<rise||time>set) return '非白天时段';
      return '';
    };
    // Evaluate the full two-hour window, including rain accumulated at its end.
    for(let i=0;i<times.length-2;i++) {
      const start=epoch(times[i],w),end=epoch(times[i+2],w);
      if (start<now || end>now+24*HOUR || end-start!==2*HOUR) continue;
      const issues=[issue(i),issue(i+1),issue(i+2)].filter(Boolean);
      if(issues.length) {issues.forEach(x=>reasons.set(x,(reasons.get(x)||0)+1));continue;}
      const ts=[i,i+1,i+2].map(j=>h.temperature_2m[j]);
      candidates.push({start,end,label:times[i].slice(5,16).replace('T',' ')+'–'+times[i+2].slice(11,16),min:Math.min(...ts),max:Math.max(...ts),pop:Math.max(...[i,i+1,i+2].map(j=>h.precipitation_probability[j]))});
    }
    const windows=[];
    for(const c of candidates) {if(!windows.length||c.start>=windows[windows.length-1].end) windows.push(c);if(windows.length===3)break;}
    return {available:true,windows,cfg,reason:[...reasons].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]).join('、')||'预报覆盖不足'};
  }
  const api={epoch,freshness,covers,sample,rainTotal,nextTwo,outdoor,activities};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.WeatherInsights=api;
})(typeof window!=='undefined'?window:globalThis);
