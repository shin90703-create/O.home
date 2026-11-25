export function encounterViews(html) {
  const edits = [
    ["function mission(){", `function walkerLevel(s, p) {
  return s.enemyLevel || p.risk;
}
function startWalker(s, p) {
  const roll = Math.random();
  const shift = roll < .25 ? -1 : roll >= .75 ? 1 : 0;
  s.enemyLevel = Math.max(1, Math.min(3, p.risk + shift));
  s.enemyHp = 16 + s.enemyLevel * 10 + Math.floor(Math.random() * 10);
}
function mission(){`],
    ["s.enemyHp=16+p.risk*10+Math.floor(Math.random()*10);", "startWalker(s,p);"],
    ["Math.floor(Math.random()*10+6)-(actions[target]", "Math.floor(Math.random()*10+6)+(walkerLevel(s,p)-2)*2-(actions[target]"],
    ["fight=s.enemyHp>0", "fight=s.status==='active'&&s.enemyHp>0"],
    ['<div class="mission-bg"><div class="over">', '<div class="mission-bg encounter-feed" style="--site-image:url(/ashline/scenes/${p.id}.webp)">${fight?\x60<img class="walker" src="/ashline/scenes/walker-${walkerLevel(s,p)}.webp" alt="배회자 레벨 ${walkerLevel(s,p)}"><span class="walker-label">배회자 · Lv.${walkerLevel(s,p)}</span>\x60:""}<div class="over">'],
    ["⚠ 감염자 조우 · HP", "⚠ 배회자 Lv.${walkerLevel(s,p)} 조우 · HP"],
    ["감염자 발견 · HP ${s.enemyHp}", "배회자 Lv.${s.enemyLevel} 발견 · HP ${s.enemyHp}"]
  ];
  for (const [before, after] of edits) {
    if (!html.includes(before)) throw Error('Missing encounter template: '+before);
    html = html.replace(before, () => after);
  }
  return html;
}
