// Apply to the generated chapter after the existing mission and travel extensions.
export function independentMissions(html) {
  const helpers = `function openMission(s) {
  return s?.status === 'waiting' || s?.status === 'active';
}
function myMission() {
  return state.soloMissions?.[state.active] || state.session;
}
function missionInProgress() {
  return openMission(state.session) || Object.values(state.soloMissions || {}).some(openMission);
}
function startBlock(p,node) {
  if (!node || node.done) return '이미 완료된 수색지야.';
  if (openMission(myMission())) return '내가 진행 중인 탐사를 먼저 종료해 줘.';
  const partner = state.soloMissions?.[other()];
  if (openMission(partner) && (p.mode === 'coop' || partner.siteId === p.id))
    return p.mode === 'coop' ? '동료의 개인 탐사가 끝나야 합류할 수 있어.' : '동료가 이 수색지를 탐사 중이야.';
  if (me().location !== p.location) return LOCATIONS[p.location].name+'에 도착해야 해.';
  if (p.mode === 'coop' && state.users[other()].location !== p.location) return '동료도 이 지점에 도착해야 해.';
  if (fogBlocks(me()) || (p.mode === 'coop' && fogBlocks(state.users[other()]))) return '유독 안개 · 참가자 방독면 착용 필요';
  return '';
}
function storeMission(s) {
  state.soloMissions ||= {};
  if (s.kind === 'coop') {
    state.soloMissions = {};
    state.session = s;
  } else {
    state.soloMissions[state.active] = s;
    if (!openMission(state.session)) state.session = null;
  }
}
function carriesCrowbar(s) {
  return s.participants.some(id => count(state.users[id], 'crowbar') > 0);
}
function finishThirdStage(s) {
  if (s.warehouse || s.status !== 'active') return;
  if (Math.random() >= 0.10) return endMission(s,true);
  s.warehouse = carriesCrowbar(s) ? 'locked' : 'noTool';
  eventText(s,'마지막 구역 너머에서 폐쇄된 창고를 발견했다.');
}
function warehousePanel(s) {
  const ready = s.warehouse === 'locked' && carriesCrowbar(s);
  const hint = ready ? '문틈에 지렛대를 넣으면 잠긴 문을 열 수 있어.' : '가져온 지렛대가 없어. 문을 열 수 없지만 수색 물자는 챙겨 갈 수 있어.';
  const choices = (ready ? '<button class="btn primary" data-action="openWarehouse">지렛대로 열기</button>' : '') +
    '<button class="btn outline" data-action="skipWarehouse">창고를 지나쳐 귀환하기</button>';
  return '<div class="over">수색 완료 · 3 / 3</div><h3>폐쇄된 창고 발견</h3><p class="muted">'+hint+'</p>' +
    (s.leader === state.active ? '<div class="btnrow">'+choices+'</div>' : '<p>탐사 대장의 선택을 기다리는 중이야.</p>');
}
function resolveWarehouse(s,open) {
  if (!s || s.status !== 'active' || !s.warehouse || s.leader !== state.active) return;
  if (open) {
    if (s.warehouse !== 'locked' || !carriesCrowbar(s)) return;
    const site = POOL.find(p => p.id === s.siteId);
    if (!Object.keys(s.loot).length) gainLoot(s,site,1);
    eventText(s,'지렛대로 창고 문을 열고 남겨진 물자를 확보했다.');
    gainLoot(s,site,2);
  } else eventText(s,'창고를 지나쳐 확보한 수색 물자를 챙겨 돌아왔다.');
  endMission(s,true);
}
function leaveMissionResult() {
  if (openMission(myMission())) return;
  if (state.soloMissions?.[state.active]) delete state.soloMissions[state.active];
  else state.session = null;
  ui.page = 'map';
}
`;
  const live = "state.session&&['active','waiting'].includes(state.session.status)";
  const edits = [
    ['function refreshIfNeeded(){if('+live+')',helpers+'function refreshIfNeeded(){if(missionInProgress())'],
    ['state.active=slot;ui.profileId=slot;', `if (state.session?.kind === 'solo') {
      state.soloMissions ||= {};
      state.soloMissions[state.session.leader || state.session.participants[0]] = state.session;
      state.session = null;
    }
    state.active=slot;ui.profileId=slot;`],
    ['const u = me(), session = state.session;', 'const u = me(), session = myMission();'],
    [/let eligible=\(p.mode==='coop'\?canCoop:can\).*?;return/, "const reason=startBlock(p,s),eligible=!reason;return"],
    ["eligible?'가능':'이동 필요'", "eligible?'가능':esc(reason)"],
    ["s.done||!eligible||!!("+live+")?", "!eligible?"],
    ["s.done?'탐사 완료':toxicFogActive()&&!eligible?'⚠ 방독면 필요':", "s.done?'탐사 완료':reason?esc(reason):"],
    ["${!eligible?'<button class=\"btn outline\"", "${!can?'<button class=\"btn outline\""],
    [live+'?`<div class="highlight"><b>진행 중인 탐사가 있어.', 'openMission(myMission())?`<div class="highlight"><b>진행 중인 탐사가 있어.'],
    ['function mission(){let s=state.session;', 'function mission(){let s=myMission();'],
    ['function chooseMission(v){let s=state.session;', 'function chooseMission(v){let s=myMission();'],
    [/case'start':\{if\(fogGate\(\)\)return;[\s\S]*?let participants=/, "case'start':{const node=state.sites.find(n=>n.id===id),p=POOL.find(q=>q.id===id);if(!p)return;const reason=startBlock(p,node);if(reason){notify(reason);return}let participants="],
    ["state.session={siteId:id", "storeMission({siteId:id"],
    ["출발 준비 완료`]};if(p.mode", "출발 준비 완료`]});if(p.mode"],
    ["if(state.session&&['waiting','active'].includes(state.session.status))endMission(state.session,false)", "if(openMission(myMission()))endMission(myMission(),false)"],
    ["case'return':state.session=null;ui.page='map';", "case'return':leaveMissionResult();"],
    ["function endMission(s,success=true){s.status=", "function endMission(s,success=true){if(!openMission(s))return;s.status="],
    ['if(s.stage>=3&&s.enemyHp<=0)endMission(s,true)', 'if(s.stage>=3&&s.enemyHp<=0)finishThirdStage(s)'],
    ['if(s.actions[state.active])return;let u=me()', 'if(s.warehouse||s.actions[state.active])return;let u=me()'],
    ['`:`<div class="over">구역 진행도', '`:s.warehouse?warehousePanel(s):`<div class="over">구역 진행도'],
    ["case'cancel':if(openMission(myMission()))", "case'openWarehouse':case'skipWarehouse':resolveWarehouse(myMission(),name==='openWarehouse');break;case'cancel':if(myMission()?.warehouse)break;if(openMission(myMission()))"]
  ];
  for(const [before,after] of edits) {
    if(typeof before==='string' ? !html.includes(before) : !before.test(html)) throw Error('Missing mission hook: '+before);
    html=html.replace(before,()=>after);
  }
  return html;
}
