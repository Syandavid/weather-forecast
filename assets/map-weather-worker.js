/* Heavy raster work runs off the UI thread. No network/weather calls here. */
importScripts('./map-weather.js?v=27.1');
self.onmessage=async function(event){
  const job=event.data,started=performance.now();
  try{
    const result=self.MapWeather.raster(job.grid,job.width,job.height,job.bounds,job.clouds,job.rain);
    if(result.known&&typeof OffscreenCanvas!=='undefined'&&typeof FileReaderSync!=='undefined'){
      try{
        const canvas=new OffscreenCanvas(job.width,job.height),ctx=canvas.getContext('2d'),img=ctx.createImageData(job.width,job.height);
        img.data.set(result.pixels);ctx.putImageData(img,0,0);
        const url=new FileReaderSync().readAsDataURL(await canvas.convertToBlob({type:'image/png'}));
        self.postMessage({id:job.id,known:result.known,url,ms:Math.round(performance.now()-started)});return;
      }catch(_){/* Older engines fall back to transferring the pixels. */}
    }
    self.postMessage({id:job.id,known:result.known,pixels:result.pixels,ms:Math.round(performance.now()-started)},[result.pixels.buffer]);
  }catch(error){self.postMessage({id:job.id,error:true});}
};
