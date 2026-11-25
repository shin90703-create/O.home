import { encounterViews } from './ashline-encounters.mjs';
import { upgradeRest } from './ashline-rest.mjs';
import { characterViews } from './ashline-character-views.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const dir = new URL('../public/ashline/', import.meta.url);
const read = file => readFile(new URL(file,dir),'utf8');
const [html,visibility,observer,player,lore,scroll] = await Promise.all(['index.html','visibility.js','observer.js','player-hooks.js','lore.js','scroll.css'].map(read));
// These handlers use the chapter's private state. Install them in its closure before startup.
const marker = "if(!state.sites.length)buildSites();attach();render();";
if (!html.includes(marker)) throw Error('ASHLINE chapter startup marker missing.');
const districtLandmarks = `
Object.assign(LOCATIONS.station, {
  name:'중앙로역 승강장',
  desc:'물자국이 남은 1호선 승강장. 계단 위 노선도에서 판암 방면 화살표만은 아직 또렷하다.'
});
Object.assign(LOCATIONS.arcade, {
  name:'은행동 상가',
  desc:'빛이 꺼진 으능정이 거리. 빈 빵집 유리문에는 튀김소보로가 나오는 시간이 아직 붙어 있다.'
});
Object.assign(LOCATIONS.sewer, {
  name:'목척교 배수로',
  desc:'목척교 아래, 하천 옆에 자리 잡은 두 사람의 거점. 물이 잦아들면 건너편 중앙시장 쪽 셔터들이 보인다.'
});
`;
const recovery = await read('recovery.js');
const recoveryViews = source => source
  .replaceAll('${me().hp}', '${vitalValue(me(),"hp")}')
  .replaceAll('${me().sp}', '${vitalValue(me(),"sp")}')
  .replaceAll('style="width:${u.hp}%"', 'data-hp-meter="${u === state.users.A ? "A" : "B"}" style="width:${u.hp}%"')
  .replaceAll('${u.hp}/', '${vitalValue(u,"hp")}/')
  .replaceAll('${u.hp}<small>', '${vitalValue(u,"hp")}<small>')
  .replaceAll('${u.sp}', '${vitalValue(u,"sp")}')
  .replace('설비 효과는 두 생존자에게 누적돼.', '어디서든 HP는 5분마다, SP는 3분마다 1씩 자연 회복돼. 거점에서 휴식하면 아래 수치만큼 추가로 회복해.');
const compactStyles = await read('compact.css');
const itemEffects = await read('item-effects.js');
const characterHelpers = await read('characters.js');
// End the fog that was in progress when this balance change was requested.
const fogClearAt = Date.parse('2026-11-26T04:27:21+09:00');
function inventoryPanels(source) {
  const start = source.indexOf('<div class="smallkv"><span>공격 보너스</span>');
  const status = source.indexOf('<div class="smallkv"><span>상태</span>', start);
  const end = source.indexOf('</b></div>', status) + '</b></div>'.length;
  const injury = '<div class="smallkv"><span>부상</span>';
  if (start < 0 || status < start || end <= status || !source.includes(injury)) throw Error('Missing inventory stat rows');
  const bonuses = source.slice(start, status);
  return (source.slice(0, start) + source.slice(end)).replace(injury, () => bonuses + injury)
    .replace("${u.wounds?'출혈 발생':'없음'}", "${u.wounds?'출혈 · 턴마다 HP 감소':'없음'}");
}
const districtHtml = inventoryPanels(upgradeRest(characterViews(encounterViews(html))))
  .replace('</head>', () => '<style>'+compactStyles+'</style></head>')
  .replace('<p class="muted" style="margin:10px 0 0">${it.desc}</p>', '${itemDetails(k)}')
  .replace("!['bandage','soup','meal','can','water'].includes(k)", "!consumableEffects[k]")
  .replace("let u=me(),hp=0,sp=0;if(id==='bandage'){hp=18;u.wounds=0}else if(id==='soup'){hp=12;sp=10}else if(id==='meal'){hp=16;sp=15}else if(id==='can'){hp=5;sp=6}else if(id==='water')sp=12;else return;", "const u=me(),effect=consumableEffects[id];if(!effect)return;const {hp,sp}=effect;if(effect.stopsBleeding)u.wounds=0;")
  .replace('function zoneInfo(){', "function travelCost(destination){return destination==='sewer'?0:6;}\nfunction zoneInfo(){")
  .replace('cost=6,inMission=', 'cost=travelCost(ui.location),inMission=')
  .replace('→ ${loc.name} 이동 (SP -${cost})', '${cost ? "→ "+loc.name+" 이동 (SP -"+cost+")" : "거점으로 귀환 (SP 0)"}')
  .replace("if(u.sp<6){notify('이동에 필요한 활동력 SP 6이 부족해.');return}u.sp-=6;", "const cost=travelCost(to);if(u.sp<cost){notify('이동에 필요한 활동력 SP '+cost+'이 부족해.');return}u.sp-=cost;")
  .replaceAll(' · SP -6`', ' · ${cost ? "SP -"+cost : "거점 귀환 · SP 0"}`')
  .replaceAll('fogRandomMinutes(45,150)', 'fogRandomMinutes(60,165)')
  .replace('ashlineConnected=true;document.documentElement', `{
    if (state.fogCycle && fogCycle.activeUntil > ${fogClearAt} && fogCycle.lastStart <= ${fogClearAt}) {
      state.fogCycle=fogCycle=newFogSchedule();
    }
  } ashlineConnected=true;document.documentElement`)
  .replace('fogRandomMinutes(30,180)', 'fogRandomMinutes(10,30)')
  .replace(/const WEATHER_ENDPOINT='[^']+';/, "const WEATHER_ENDPOINT='/api/ashline/weather';")
  .replaceAll('· Open-Meteo','· 기상청 관측')
  .replace('weatherLive.condition=wmoName(weatherLive.code);','weatherLive.condition=current.condition;')
  .replace('weatherLive.updated=Date.now();','weatherLive.updated=current.observedAt;')
  .replaceAll('마지막 수신','관측 시각')
  .replaceAll('대전 일반 생활권을 모티브로 제작한 가상 도시 지도.', '은행동과 목척교 일대를 모티브로 한 가상 생활권 지도.')
  .replaceAll('<b>B-03 생활권</b></div>${mapPins()}', '<b>B-03 은행동 · 목척교</b></div>${mapPins()}');
const inject = (source, hooks) => source.replace(marker, () => itemEffects+'\n'+characterHelpers+'\n'+districtLandmarks+'\n'+hooks+'\n'+marker);
await writeFile(new URL('chapter.html',dir),inject(recoveryViews(districtHtml),recovery+'\n'+visibility+'\n'+player));
const watch=inject(districtHtml,observer).replace("window.parent.postMessage({type:'ASHLINE_READY'},location.origin)",'void 0');
await writeFile(new URL('observer.html',dir),watch.replace('</head>',()=>'<style>'+scroll+'.sidebar{overflow-y:auto!important;min-height:0!important}</style></head>').replace('</body>',()=>'<script>'+lore+'</script></body>'));
