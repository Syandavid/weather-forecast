(function (root) {
  'use strict';
  // Common Chinese aliases supplement GeoNames' incomplete translated names.
  // They expand a query, never replace the provider's coordinates or other matches.
  const aliases = [
    ['伦敦|倫敦', 'London', 'GB'], ['纽约|紐約', 'New York', 'US'],
    ['东京|東京|东京都|東京都', 'Tokyo', 'JP'], ['巴黎', 'Paris', 'FR'],
    ['悉尼|雪梨', 'Sydney', 'AU'], ['墨尔本|墨爾本', 'Melbourne', 'AU'],
    ['奥克兰|奧克蘭', 'Auckland', 'NZ'], ['惠灵顿|惠靈頓', 'Wellington', 'NZ'],
    ['新加坡', 'Singapore', 'SG'], ['首尔|首爾|서울', 'Seoul', 'KR'],
    ['大阪', 'Osaka', 'JP'], ['京都', 'Kyoto', 'JP'],
    ['曼谷', 'Bangkok', 'TH'], ['吉隆坡', 'Kuala Lumpur', 'MY'],
    ['雅加达|雅加達', 'Jakarta', 'ID'], ['马尼拉|馬尼拉', 'Manila', 'PH'],
    ['迪拜|杜拜', 'Dubai', 'AE'], ['新德里', 'New Delhi', 'IN'],
    ['孟买|孟買', 'Mumbai', 'IN'], ['莫斯科', 'Moscow', 'RU'],
    ['柏林', 'Berlin', 'DE'], ['罗马|羅馬', 'Rome', 'IT'],
    ['马德里|馬德里', 'Madrid', 'ES'], ['阿姆斯特丹', 'Amsterdam', 'NL'],
    ['洛杉矶|洛杉磯', 'Los Angeles', 'US'], ['旧金山|舊金山', 'San Francisco', 'US'],
    ['华盛顿|華盛頓', 'Washington', 'US'], ['芝加哥', 'Chicago', 'US'],
    ['温哥华|溫哥華', 'Vancouver', 'CA'], ['多伦多|多倫多', 'Toronto', 'CA'],
    ['圣保罗|聖保羅', 'São Paulo', 'BR'], ['里约热内卢|里約熱內盧', 'Rio de Janeiro', 'BR'],
    ['布宜诺斯艾利斯|布宜諾斯艾利斯', 'Buenos Aires', 'AR'],
    ['开普敦|開普敦', 'Cape Town', 'ZA'], ['内罗毕|內羅畢', 'Nairobi', 'KE'],
    ['开罗|開羅', 'Cairo', 'EG']
  ];
  function normalize(value) { return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' '); }
  function coordinates(value) {
    const q = normalize(value);
    if (!/^[+\-\d.\s,，]+$/.test(q) || !/[,，]/.test(q)) return null;
    const parts = q.split(/[,，]/);
    const validNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
    if (parts.length !== 2 || parts.some(p => !validNumber.test(p.trim()))) return {error:'请输入「纬度, 经度」，例如 35.6895, 139.6917'};
    const lat = Number(parts[0]), lon = Number(parts[1]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return {error:'纬度范围为 -90～90，经度范围为 -180～180；请检查顺序'};
    return {name:'坐标 ' + lat.toFixed(4) + ', ' + lon.toFixed(4), lat, lon, coordinate:true};
  }
  function plans(value) {
    const q = normalize(value);
    // Preserve ranking from the input language. Translated searches can rank a
    // small namesake above the intended city (e.g. York before New York).
    const languages = /^[\x00-\x7F]+$/.test(q) ? ['en','zh'] : ['zh','en'];
    const out = languages.map(language => ({q, language}));
    const [name, ...qualifier] = q.split(/[,，]/).map(s => s.trim());
    const alias = aliases.find(row => row[0].split('|').includes(name));
    if (alias) out.unshift({q:alias[1] + (qualifier.length ? ', ' + qualifier.join(', ') : ''), language:qualifier.length ? 'zh' : 'en', countryCode:qualifier.length ? '' : alias[2]});
    const native = /[\u3040-\u30ff]/.test(q) ? 'ja' : /[\uac00-\ud7af]/.test(q) ? 'ko' : /[\u0400-\u04ff]/.test(q) ? 'ru' : /[\u0600-\u06ff]/.test(q) ? 'ar' : null;
    if (native) out.push({q, language:native});
    return out.map(p => ({language:p.language, url:'https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({name:p.q, count:'20', format:'json', language:p.language, ...(p.countryCode ? {countryCode:p.countryCode} : {})})}));
  }
  function key(c) { return Number(c.lat).toFixed(4) + ',' + Number(c.lon).toFixed(4); }
  function merge(batches) {
    const groups = new Map();
    batches.forEach(batch => (batch.results || []).forEach(r => {
      if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || Math.abs(r.latitude) > 90 || Math.abs(r.longitude) > 180) return;
      const id = r.id != null ? String(r.id) : key({lat:r.latitude, lon:r.longitude});
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({r, language:batch.language});
    }));
    return Array.from(groups.values()).map(variants => {
      const first = variants[0].r, china = first.country_code === 'CN';
      const en = variants.find(v => v.language === 'en'), zh = variants.find(v => v.language === 'zh');
      const preferred = (china ? zh : en) || variants[0], r = preferred.r;
      const native = variants.find(v => !['zh','en'].includes(v.language));
      const name = String(r.name || '未命名地点');
      const local = !china && native && native.r.name !== name ? native.r.name : '';
      const detail = (zh || preferred).r;
      return {name:name + (local ? ' · ' + local : ''), lat:r.latitude, lon:r.longitude,
        admin:[detail.admin1, detail.admin2].filter((x,i,a) => x && a.indexOf(x) === i).join(' · '),
        country:detail.country || r.country_code || '', country_code:r.country_code || '',
        timezone:r.timezone || '', isChina:china};
    }).slice(0, 40);
  }
  function create({getJson, onUpdate, now = Date.now}) {
    let generation = 0;
    const cache = new Map();
    function cancel() { generation++; }
    async function search(value) {
      const token = ++generation, q = normalize(value), coord = coordinates(q);
      const emit = state => { if (token === generation) onUpdate(state); };
      if (!q) { emit({rows:[], message:'', loading:false}); return; }
      if (coord) { emit({rows:coord.error ? [] : [coord], message:coord.error || '按此坐标查询天气（不依赖地名收录）', loading:false}); return; }
      if (Array.from(q.split(/[,，]/)[0].trim()).length < 2) { emit({rows:[], message:'城市名至少输入 2 个字符；也可以输入纬度、经度', loading:false}); return; }
      const cached = cache.get(q.toLowerCase());
      if (cached && now() - cached.at < 600000) { emit({rows:cached.rows, message:'请选择城市，注意国家和地区', loading:false}); return; }
      const requests = plans(q), batches = Array(requests.length), errors = [];
      let pending = requests.length;
      emit({rows:[], message:'正在搜索全球地名…', loading:true});
      await Promise.all(requests.map(async (p, i) => {
        try {
          const result = await getJson(p.url);
          if (!result || result.error || (result.results != null && !Array.isArray(result.results))) throw new Error('Invalid geocoding response');
          batches[i] = {language:p.language, results:result.results || []};
        } catch (e) { errors.push(i); }
        pending--;
        if (token !== generation) return;
        const rows = merge(batches.filter(Boolean));
        const message = pending ? (rows.length ? '可先选择城市，正在补充其他匹配…' : '正在搜索全球地名…')
          : errors.length === requests.length ? '地名服务暂时无法连接，请重试；也可输入坐标查询天气'
          : rows.length ? (errors.length ? '部分语言查询失败，以下结果仍可选择；可重试补全' : '请选择城市，注意国家和地区')
          : '未找到匹配。请尝试英文名、完整地名（如 Tokyo），或输入纬度, 经度';
        emit({rows, message, loading:!!pending, retry:!pending && !!errors.length});
        if (!pending && !errors.length && rows.length) {
          cache.delete(q.toLowerCase()); cache.set(q.toLowerCase(), {rows, at:now()});
          if (cache.size > 30) cache.delete(cache.keys().next().value);
        }
      }));
    }
    return {cancel, search};
  }
  root.CitySearch = {normalize, coordinates, plans, merge, key, create};
})(typeof globalThis !== 'undefined' ? globalThis : window);
