const defaultFiles = [
  { file:'bgpic1.jpg', name:'Wallpaper 1' },
  { file:'bgpic2.jpg', name:'Wallpaper 2' },
  { file:'bgpic3.jpg', name:'Wallpaper 3' },
  { file:'bgpic4.jpg', name:'Wallpaper 4' },
  { file:'bgpic5.jpg', name:'Wallpaper 5' },
];
const validFile = filename => typeof filename==='string' && /^[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|svg)$/i.test(filename) && filename.length<100;
export const wallpaperUrl = filename => validFile(filename) ? './assets/wallpapers/'+encodeURIComponent(filename) : null;
export function savedWallpaper(storage) {
  try { const value=storage?.getItem('cold-call-wallpaper');return validFile(value)?value:defaultFiles[0].file; }
  catch {return defaultFiles[0].file;}
}
export async function loadWallpapers(fetcher=fetch) {
  try {
    const response=await fetcher('./assets/wallpapers/manifest.json',{cache:'no-store'});
    if(!response.ok)return defaultFiles;
    const data=await response.json();
    if(!Array.isArray(data))return defaultFiles;
    const found=new Map(defaultFiles.map(o=>[o.file,o]));
    for(const entry of data.slice(0,60)) {
      if(validFile(entry?.file) && typeof entry?.name==='string' && entry.name.length<=50)
        found.set(entry.file,{file:entry.file,name:entry.name});
    }
    return [...found.values()];
  } catch {return defaultFiles;}
}
