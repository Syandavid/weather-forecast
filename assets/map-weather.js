(function(root) {
  'use strict';
  function satelliteStamp(kind, unix, now=Date.now()/1000) {
    // A future forecast must never reuse an observation as if it were future imagery.
    if (unix>now+45) return null;
    const t=kind==='infrared' ? Math.floor(Math.min(unix,now-50*60)/600)*600 : unix;
    const iso=new Date(t*1000).toISOString();
    return kind==='infrared' ? iso.slice(0,19)+'Z' : iso.slice(0,10);
  }
  function raster(grid, width, height, bounds, clouds, rain) {
    const pixels=new Uint8ClampedArray(width*height*4), rows=grid.length, cols=grid[0].length;
    const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    const top=merc(bounds.north), bottom=merc(bounds.south);
    const val=(corners,weights,key)=>corners.every((p,i)=>weights[i]<1e-9 || p && Number.isFinite(p[key])) ? corners.reduce((s,p,i)=>s+(weights[i]<1e-9?0:p[key]*weights[i]),0) : null;
    let known=0;
    for(let y=0;y<height;y++) {
      const lat=(2*Math.atan(Math.exp(top+(bottom-top)*y/(height-1)))-Math.PI/2)*180/Math.PI;
      const gy=Math.max(0,Math.min(rows-1,(lat-bounds.south)/(bounds.north-bounds.south)*(rows-1)));
      const iy=Math.min(rows-2,Math.floor(gy)), fy=gy-iy;
      for(let x=0;x<width;x++) {
        const gx=x/(width-1)*(cols-1), ix=Math.min(cols-2,Math.floor(gx)), fx=gx-ix;
        const c=[grid[iy][ix],grid[iy][ix+1],grid[iy+1][ix],grid[iy+1][ix+1]], w=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
        const cloud=clouds?val(c,w,'cloud'):null, mm=rain?val(c,w,'mm'):null;
        if((clouds&&cloud!==null)||(rain&&mm!==null))known++;
        let rgb=[220,230,240], alpha=cloud===null?0:Math.max(0,Math.min(100,cloud))/100*.48;
        if(mm!==null&&mm>=.08) {
          const color=mm<.5?[125,211,252]:mm<2?[56,189,248]:mm<6?[14,165,233]:mm<15?[99,102,241]:[124,58,237];
          const a=Math.min(.82,.36+Math.log1p(mm)*.12), combined=a+alpha*(1-a);
          rgb=color.map((v,i)=>(v*a+rgb[i]*alpha*(1-a))/combined);alpha=combined;
        }
        const p=(y*width+x)*4;pixels[p]=rgb[0];pixels[p+1]=rgb[1];pixels[p+2]=rgb[2];pixels[p+3]=Math.round(alpha*255);
      }
    }
    return {pixels,known};
  }
  root.MapWeather={satelliteStamp,raster};
})(typeof window!=='undefined'?window:globalThis);
