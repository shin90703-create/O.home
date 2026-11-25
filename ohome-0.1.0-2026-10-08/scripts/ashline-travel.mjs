export function travelViews(html) {
  const rules = `function travelCost(to) { return to === 'sewer' ? 0 : 6; }
function travelBlock(to) {
  const u = me(), session = state.session;
  if (to === u.location) return '이미 이곳에 있어';
  if (!LOCATIONS[to] || !reachable(u,to)) return '직접 연결된 지점을 먼저 선택해 줘';
  if (session && ['active','waiting'].includes(session.status)
      && (session.participants || [session.leader]).includes(state.active)) return '참가 중인 탐사를 먼저 종료해 줘';
  if (fogBlocks(u)) return '유독 안개 · 방독면 착용 필요';
  if (u.sp < travelCost(to)) return '활동력 부족 · SP '+u.sp+' / 필요 '+travelCost(to);
  return '';
}
function travelLabel(to, blocked) {
  if (blocked) return blocked;
  return travelCost(to) ? '→ '+LOCATIONS[to].name+' 이동 (SP -'+travelCost(to)+')' : '거점으로 귀환 (SP 0)';
}
function refreshTravelButton() {
  const button = document.querySelector('button[data-action="move"]');
  if (!button) return;
  const to = button.dataset.location, blocked = travelBlock(to);
  button.disabled = Boolean(blocked);
  const label = travelLabel(to,blocked);
  if (button.textContent !== label) button.textContent = label;
}
`;
  const edits = [
    ['function zoneInfo(){', rules+'function zoneInfo(){'],
    ["cost=6,inMission=state.session&&['active','waiting'].includes(state.session.status)", "cost=travelCost(ui.location),blocked=travelBlock(ui.location)"],
    ["same||!adj||me().sp<cost||inMission||fogBlocks(me())?", "blocked?"],
    ["${same?'이미 이곳에 있어':fogBlocks(me())?'⚠ 유독 안개 · 방독면 필요':`→ ${loc.name} 이동 (SP -${cost})`}", "${travelLabel(ui.location,blocked)}"],
    [/case'move':\{if\(fogGate\(\)\)return;let u=me\(\),to=id;[^\n]+?u\.sp-=6;/,
     "case'move':{const u=me(),to=id,blocked=travelBlock(to);if(blocked){notify(blocked);return}const cost=travelCost(to);u.sp-=cost;"],
    [/ · SP -6`/g, ' · ${cost ? "SP -"+cost : "거점 귀환 · SP 0"}`']
  ];
  for (const [before,after] of edits) {
    if (typeof before === 'string' ? !html.includes(before) : !html.match(before)) throw Error('Missing travel hook: '+before);
    html = html.replace(before, () => after);
  }
  return html;
}
