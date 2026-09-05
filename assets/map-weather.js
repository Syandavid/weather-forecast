(function(root) {
  'use strict';
  const finite=Number.isFinite, log1p=Math.log1p, round=Math.round, min=Math.min;
  function satelliteStamp(kind, unix, now=Date.now()/1000) {
    // A future forecast must never reuse an observation as if it were future imagery.
    if (unix>now+45) return null;
    const t=kind==='infrared' ? Math.floor(Math.min(unix,now-50*60)/600)*600 : unix;
    const iso=new Date(t*1000).toISOString();
    return kind==='infrared' ? iso.slice(0,19)+'Z' : iso.slice(0,10);
  }
  const smooth=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};
  const rainStops=[[0,[150,225,248]],[.5,[80,196,240]],[2,[22,146,226]],[6,[78,111,220]],[15,[115,83,206]],[40,[143,64,179]]];
  const rainLut=new Float32Array(4096*4), rainLog=Math.log1p(100);
  for(let i=0;i<4096;i++) {
    const mm=Math.expm1(i/4095*rainLog);
    let hi=1;while(hi<rainStops.length-1&&mm>rainStops[hi][0])hi++;
    const a=rainStops[hi-1],b=rainStops[hi],t=Math.min(1,(Math.log1p(mm)-Math.log1p(a[0]))/(Math.log1p(b[0])-Math.log1p(a[0])));
    for(let k=0;k<3;k++)rainLut[i*4+k]=a[1][k]+(b[1][k]-a[1][k])*t;
    // Continuous low-rain alpha avoids the former hard 0.08 mm boundary.
    rainLut[i*4+3]=smooth((mm-.05)/.30)*(.40+.30*(1-Math.exp(-mm/5)));
  }
  function renderSize(width,height,dpr=1) {
    width=Math.max(2,width);height=Math.max(2,height);
    const scale=Math.min(Math.max(1,Math.min(1.5,dpr)),1024/Math.max(width,height),Math.sqrt(400000/(width*height)));
    return {width:Math.max(2,Math.floor(width*scale)),height:Math.max(2,Math.floor(height*scale))};
  }
  function refineGrid(grid,factor=4) {
    // Shape-preserving interpolation smooths cell seams without adding noise
    // or overshooting the source samples. Unknown endpoints stay unknown.
    const slope=(a,b)=>a*b<=0?0:2*a*b/(a+b);
    const interpolate=(p,a,b,n,t)=>{
      if(t===0)return a;if(t===1)return b;
      if(!finite(a)||!finite(b))return null;
      const delta=b-a,m0=finite(p)?slope(a-p,delta):delta,m1=finite(n)?slope(delta,n-b):delta;
      const t2=t*t,t3=t2*t,value=(2*t3-3*t2+1)*a+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b+(t3-t2)*m1;
      return Math.max(Math.min(a,b),Math.min(Math.max(a,b),value));
    };
    const expand=line=>{
      const out=[];
      for(let i=0;i<line.length-1;i++)for(let j=0;j<factor;j++){
        const item={};for(const k of ['cloud','mm'])item[k]=interpolate(line[i-1]?.[k],line[i]?.[k],line[i+1]?.[k],line[i+2]?.[k],j/factor);out.push(item);
      }
      out.push(line[line.length-1]);return out;
    };
    const horizontal=grid.map(expand),rows=(grid.length-1)*factor+1,cols=horizontal[0].length,out=Array.from({length:rows},()=>[]);
    for(let x=0;x<cols;x++){const column=expand(horizontal.map(row=>row[x]));for(let y=0;y<rows;y++)out[y][x]=column[y];}
    return out;
  }
  function raster(grid, width, height, bounds, clouds, rain) {
    grid=refineGrid(grid);
    const pixels=new Uint8ClampedArray(width*height*4), rows=grid.length, cols=grid[0].length;
    const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    const top=merc(bounds.north), bottom=merc(bounds.south);
    const val=(a,b,c,d,w0,w1,w2,w3,key)=>{
      const av=a&&a[key],bv=b&&b[key],cv=c&&c[key],dv=d&&d[key];
      if((w0>1e-9&&!finite(av))||(w1>1e-9&&!finite(bv))||(w2>1e-9&&!finite(cv))||(w3>1e-9&&!finite(dv)))return null;
      return (w0>1e-9?av*w0:0)+(w1>1e-9?bv*w1:0)+(w2>1e-9?cv*w2:0)+(w3>1e-9?dv*w3:0);
    };
    const xIndex=new Uint16Array(width),xFrac=new Float64Array(width);
    for(let x=0;x<width;x++){const gx=x/(width-1)*(cols-1);xIndex[x]=Math.min(cols-2,Math.floor(gx));xFrac[x]=gx-xIndex[x];}
    let known=0;
    for(let y=0;y<height;y++) {
      const lat=(2*Math.atan(Math.exp(top+(bottom-top)*y/(height-1)))-Math.PI/2)*180/Math.PI;
      const gy=Math.max(0,Math.min(rows-1,(lat-bounds.south)/(bounds.north-bounds.south)*(rows-1)));
      const iy=Math.min(rows-2,Math.floor(gy)), fy=gy-iy;
      for(let x=0;x<width;x++) {
        const ix=xIndex[x],fx=xFrac[x],a=grid[iy][ix],b=grid[iy][ix+1],c=grid[iy+1][ix],d=grid[iy+1][ix+1];
        const w0=(1-fx)*(1-fy),w1=fx*(1-fy),w2=(1-fx)*fy,w3=fx*fy;
        const cloud=clouds?val(a,b,c,d,w0,w1,w2,w3,'cloud'):null, mm=rain?val(a,b,c,d,w0,w1,w2,w3,'mm'):null;
        if((clouds&&cloud!==null)||(rain&&mm!==null))known++;
        const cloudAlpha=cloud===null?0:smooth(cloud/100)*.34;
        const li=mm!==null&&mm>.05?min(4095,round(log1p(mm)/rainLog*4095))*4:0;
        const rainAlpha=rainLut[li+3],under=cloudAlpha*(1-rainAlpha),alpha=rainAlpha+under;
        const p=(y*width+x)*4;
        if(alpha>0){pixels[p]=(rainLut[li]*rainAlpha+224*under)/alpha;pixels[p+1]=(rainLut[li+1]*rainAlpha+235*under)/alpha;pixels[p+2]=(rainLut[li+2]*rainAlpha+243*under)/alpha;pixels[p+3]=round(alpha*255);}
      }
    }
    return {pixels,known};
  }
  root.MapWeather={satelliteStamp,raster,renderSize,refineGrid};
})(typeof window!=='undefined'?window:globalThis);
