// Patch both generated versions of the legacy single-file game at the same entry points.
export function chapterViews(html) {
  function replace(from,to) {
    if (!html.includes(from)) throw Error('Chapter integration point missing: '+from);
    html=html.split(from).join(to);
  }
  replace('class="grid cols2" style="grid-template-columns:minmax(0,1.4fr)', 'class="grid cols2 mission-layout" style="grid-template-columns:minmax(0,1.4fr)');
  replace('function render(){refreshIfNeeded();','function render(){updateChapter();document.documentElement.dataset.chapter=chapterNumber();refreshIfNeeded();');
  html=html.replace(/<div class="ash-base-goal [^\n]+?<\/span><\/div>\n/, '${campaignGoal()}\n');
  replace("market:marketPage","market:traderPage");
  replace("'교역소 🔒','STORY LOCK'","chapterNumber()>=2?'교역소':'교역소 🔒',chapterNumber()>=2?'TRADE':'STORY LOCK'");
  replace('CHAPTER 01 / 내부망','CHAPTER 0${chapterNumber()} / 내부망');
  replace('function records(){return archivePage()}',"function records(){return (cluesFound().length?panel('회수한 단서','FIELD INTEL','<div class=\"panel-body\">'+cluesFound().map(c=>'<p>'+c+'</p>').join('')+'</div>'):'')+archivePage()}");
  replace('return state.sites.map(s=>','return scoutingSites().map(s=>');
  replace('const searchPins=state.sites.filter','const searchPins=scoutingSites().filter');
  replace('let s=state.sites.find(q=>q.id===ui.site)','let s=scoutingSites().find(q=>q.id===ui.site)');
  replace('const node=state.sites.find(n=>n.id===id)','const node=scoutingSites().find(n=>n.id===id)');
  replace('function storeMission(s) {','function storeMission(s) {\n  if(supplySites.some(p=>p.id===s.siteId))s.fogSupplyCycle=fogCycle.lastStart;');
  replace("count(state.users[id], 'crowbar') > 0","(count(state.users[id], 'crowbar') + count(state.users[id], 'heavyBar')) > 0");
  replace('<span>획득 가능 물자</span><strong>${p.loot.map', '<span>획득 가능 물자</span><strong>${p.origin&&!state.story.receiver?"미식별 보급품":p.loot.map');
  replace("s.done?'탐사 완료':'탐색 신호'","s.done?'탐사 완료':p.origin&&state.story.receiver?'보급 · '+p.group:'탐색 신호'");
  replace('scenes/${p.id}.webp','scenes/${p.origin||p.id}.webp');
  replace('s.enemyHp = 16 +','s.enemyKind = chapterNumber()>0 && liveToxicFog() && Math.random()<0.40 ? "침식자" : "배회자";\n  s.enemyHp = (s.enemyKind==="침식자"?34:16) +');
  replace('walker-${walkerLevel(s,p)}.webp','${s.enemyKind==="침식자"?"eroded":"walker-"+walkerLevel(s,p)}.webp');
  for(const suffix of [' · Lv.',' 레벨 ',' Lv.'])replace('배회자'+suffix+'${','${s.enemyKind||"배회자"}'+suffix+'${');
  replace('+(walkerLevel(s,p)-2)*2','+(s.enemyKind==="침식자"?5:0)+(walkerLevel(s,p)-2)*2');
  replace('damage>=5&&Math.random()<.32','damage>=5&&Math.random()<(u.equipment.armor==="liner"?.16:.32)');
  replace('gainLoot(s,p,Math.random()>.45?2:1);','gainLoot(s,p,Math.random()>.45?2:1);if(chapterNumber()&&liveToxicFog()&&Math.random()<.12){s.loot.circuit=(s.loot.circuit||0)+1;eventText(s,"수신 회로 확보");}');
  replace('}entries.forEach(([id,qty])','}recoverSupply(s);entries=Object.entries(s.loot);entries.forEach(([id,qty])');
  replace('r=>r.type===ui.craftTab','r=>recipeOpen(r)&&r.type===ui.craftTab');
  replace('if(!r)return;if(!hasFacility(r.type','if(!r||!recipeOpen(r))return;if(!hasFacility(r.type');
  replace('add(u,r.target,1);log','if(r.id==="receiver")state.story.receiver=true;else add(u,r.target,1);log');
  replace("case'use':{","case'meetTrader':case'barter':tradeAction(name);break;case'use':{if(id==='extraFilter'){useFilter();break;}");
  replace('!consumableEffects[k]',"(!consumableEffects[k]&&k!=='extraFilter')");
  replace('mob-hide">CH.01</span>', 'mob-hide">CH.0${chapterNumber()}</span>');
  replace('CH.01 / MISSION BRIEF','CH.0${chapterNumber()} / MISSION BRIEF');
  replace('function mapPage(){return `', 'function mapPage(){return (chapterNumber()?campaignGoal():"")+`');
  return html;
}
