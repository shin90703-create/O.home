// Shared campaign progress survives equipment changes and either survivor's next login.
const clues = [
  '찢어진 인수증 · 대전역 동광장에 같은 표식을 쓰는 교역상이 드나든다.',
  '회송 기록 · 보문산 기슭 옛 정비선에 객차 한 량이 남았다. 다음 거점 후보지다.',
  '무전 기록 · 누군가 오늘도 여러 사람의 식수를 요청한다. 어딘가에 생존자 캠프가 있다.'
];
function chapterNumber() { return state.story.fogChapter || 0; }
function cluesFound() { return clues.filter((_,i) => state.story.clues & (1 << i)); }
function updateChapter() {
  if (!chapterNumber() && ['A','B'].every(slot => count(state.users[slot],'gasmask') > 0)) state.story.fogChapter = 1;
  if (state.story.clues === 7) state.story.fogChapter = 2;
}
function campaignGoal() {
  const n = chapterNumber();
  const text = n === 0 ? '안전용품점에서 두 사람의 방독면 확보' : n === 1 ? '안개 속 보급품에서 단서 3종 수집' : state.story.metTrader ? '교역상과 물물교환' : '중앙로역 승강장에서 동광장 교역상 접선 표식 확인';
  const status = n === 0 ? ['A','B'].filter(k => count(state.users[k],'gasmask')).length+'/2' : n === 1 ? cluesFound().length+'/3' : '동광장 연락망';
  return '<div class="ash-base-goal"><div class="goal-text"><span class="goal-step">CH.0'+n+'</span><strong>'+text+'</strong></div><span class="goal-state">'+status+'</span></div>';
}
Object.assign(ITEMS,{
  heavyBar:{name:'강화 지렛대',cat:'장비',emoji:'🗜️',slot:'weapon',power:11,desc:'공격 +11. 휴대하면 폐쇄 창고를 열 수 있다.'},
  liner:{name:'누빔 방호복',cat:'장비',emoji:'🧥',slot:'armor',armor:5,desc:'피해 감소 5. 피격 시 출혈 확률 절반.'},
  broth:{name:'진한 보급 수프',cat:'요리',emoji:'🥣',desc:'행동력 +30.'},
  sealed:{name:'밀봉 여과재',cat:'재료',emoji:'📦',desc:'보조 필터를 만드는 안개 보급품.'},
  ticket:{name:'배급표',cat:'재료',emoji:'🎫',desc:'교역상이 물자로 교환해 준다.'},
  circuit:{name:'수신 회로',cat:'재료',emoji:'📟',desc:'안개 속에서 회수한 보급 신호 수신기 부품.'},
  extraFilter:{name:'보조 필터',cat:'재료',emoji:'🔘',desc:'방독면 착용 후 사용. 이번 안개의 수색 한도 +1. 1인 1회.'},
  receiver:{name:'보급 신호 수신기',cat:'장비',emoji:'📻',desc:'무전 장치에 설치하면 보급 신호의 물자 종류를 식별한다.'}
});
consumableEffects.broth = {hp:0,sp:30};
const fogRecipes = [
  ['heavyBar','craft',{crowbar:1,metal:3,tape:2}], ['liner','craft',{jacket:1,cloth:3,tape:2}],
  ['broth','cook',{rice:1,can:1,water:1}], ['extraFilter','craft',{sealed:1,cloth:1}],
  ['receiver','craft',{circuit:1,battery:2,metal:1}]
];
for (const [id,type,mats] of fogRecipes) RECIPES.push({id,target:id,type,mats,fog:true,desc:ITEMS[id].desc});
function recipeOpen(r) {
  return !r.fog || (chapterNumber()>0 && (r.id!=='extraFilter'||state.story.filterKnown) &&
    (r.id!=='receiver'||(state.story.circuitKnown && hasFacility('radio') && !state.story.receiver)));
}
function useFilter() {
  const u=me();
  if(!liveToxicFog() || !maskEquipped(u) || !count(u,'extraFilter') || u.filterCycle===fogCycle.activeUntil) {
    notify('실제 안개 중 방독면을 착용하고 한 번 사용할 수 있어.');return;
  }
  add(u,'extraFilter',-1);u.filterCycle=fogCycle.activeUntil;notify('이번 안개 수색 한도 +1');
}
const supplySites=['shop','pharm','library'].map((id,i)=>{
  const p=POOL.find(p=>p.id===id);
  return {...p,origin:id,id:'fog-'+id,rare:true,name:'안개 보급 신호 · '+p.name,group:['식량','의약품','자재'][i]};
});
POOL.push(...supplySites);
function scoutingSites() {
  if(!chapterNumber() || !liveToxicFog() || state.story.lastSupply===fogCycle.lastStart) return state.sites;
  const p=supplySites[Math.floor(fogCycle.lastStart/1000)%supplySites.length];
  return [{id:p.id,done:false},...state.sites];
}
function recoverSupply(s) {
  if(s.loot.circuit) state.story.circuitKnown=true;
  if(!s.fogSupplyCycle || s.fogSupplyCycle <= (state.story.lastSupply||0)) return;
  const st=state.story;
  st.lastSupply=s.fogSupplyCycle;st.filterKnown=true;s.loot.sealed=1;
  if(Math.random()<0.25) s.loot.ticket=1;
  const missing=clues.map((_,i)=>i).filter(i=>!(st.clues & (1<<i)));
  if(!missing.length)return;
  if((st.misses||0)>=5 || Math.random()<0.2) {
    const i=sample(missing);st.clues=(st.clues||0)|(1<<i);st.misses=0;
    eventText(s,'단서 확보 · '+clues[i]);updateChapter();
  } else st.misses=(st.misses||0)+1;
}
function traderPage(){
  const met=state.story.metTrader,here=me().location==='station';
  let body=chapterNumber()<2?'교역상과 연락할 단서가 더 필요해.':!here?'중앙로역 승강장으로 이동해 동광장 연락망을 확인해.':met?
    '<button class="btn primary" data-action="barter">배급표 1장과 생수 2개 교환</button>':
    '<button class="btn primary" data-action="meetTrader">동광장 접선 표식 확인</button>';
  return campaignGoal()+panel('교역소','TRADE','<div class="panel-body">'+body+'</div>');
}
function tradeAction(action){
  if(chapterNumber()<2 || me().location!=='station')return;
  if(action==='meetTrader'){state.story.metTrader=true;notify('교역상과 연락이 닿았다.');return;}
  if(!state.story.metTrader || !count(me(),'ticket')){notify('교환할 배급표가 필요해.');return;}
  add(me(),'ticket',-1);add(me(),'water',2);notify('생수 2개를 받았다.');
}
