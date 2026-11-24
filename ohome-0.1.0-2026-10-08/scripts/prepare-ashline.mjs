import { readFile, writeFile } from 'node:fs/promises';
const dir = new URL('../public/ashline/', import.meta.url);
const read = file => readFile(new URL(file,dir),'utf8');
const [html,visibility,observer,player] = await Promise.all(['index.html','visibility.js','observer.js','player-hooks.js'].map(read));
// These handlers use the chapter's private state. Install them in its closure before startup.
const marker = "if(!state.sites.length)buildSites();attach();render();";
if (!html.includes(marker)) throw Error('ASHLINE chapter startup marker missing.');
const hooks = "if(location.href==='about:srcdoc'){\n"+observer+"\n}else{\n"+visibility+"\n"+player+"\n}\n";
const chapter = html.replace(marker, () => hooks + marker)
  .replace("window.parent.postMessage({type:'ASHLINE_READY'},location.origin)", "location.href!=='about:srcdoc' && window.parent.postMessage({type:'ASHLINE_READY'},location.origin)");
await writeFile(new URL('chapter.html',dir),chapter);
