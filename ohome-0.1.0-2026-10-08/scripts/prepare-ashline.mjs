import { readFile, writeFile } from 'node:fs/promises';
const dir = new URL('../public/ashline/', import.meta.url);
const read = file => readFile(new URL(file,dir),'utf8');
const [html,visibility,observer,player] = await Promise.all(['index.html','visibility.js','observer.js','player-hooks.js'].map(read));
// These handlers use the chapter's private state. Install them in its closure before startup.
const marker = "if(!state.sites.length)buildSites();attach();render();";
if (!html.includes(marker)) throw Error('ASHLINE chapter startup marker missing.');
const inject = (source, hooks) => source.replace(marker, () => hooks+'\n'+marker);
await writeFile(new URL('chapter.html',dir),inject(html,visibility+'\n'+player));
const watch=inject(html,observer).replace("window.parent.postMessage({type:'ASHLINE_READY'},location.origin)",'void 0');
await writeFile(new URL('observer.html',dir),watch.replace('</head>','<link rel="stylesheet" href="/ashline/scroll.css"></head>').replace('</body>','<script src="/ashline/lore.js"></script></body>'));
