const consumableEffects = {
  bandage: { hp: 18, sp: 0, stopsBleeding: true },
  can: { hp: 5, sp: 6 },
  water: { hp: 0, sp: 12 },
  soup: { hp: 12, sp: 10 },
  meal: { hp: 16, sp: 15 }
};

function itemDetails(id) {
  const item = ITEMS[id], effect = consumableEffects[id];
  const lines = [];
  if (effect) {
    const benefits = [];
    if (effect.hp) benefits.push('체력(HP) +' + effect.hp);
    if (effect.sp) benefits.push('행동력(SP) +' + effect.sp);
    if (effect.stopsBleeding) benefits.push('출혈 치료');
    lines.push('사용 효과 · ' + benefits.join(' / '));
  } else if (item.slot) {
    const toolEffects = {
      flashlight: '역·병원 수색 시 추가 물자 1개 획득. 해당 탐사에서 감염자 조우 확률 10%p 감소.',
      crowbar: '상가·진료소·약국 수색 시 추가 물자 1개 획득.'
    };
    lines.push('장착 효과 · ' + (toolEffects[id] || item.desc));
  }
  if (id === 'crowbar') lines.push('휴대 효과 · 수색 마지막에 발견한 폐쇄 창고를 열 수 있어. 사용해도 소모되지 않아.');
  const recipes = RECIPES.filter(r => r.mats[id]).map(r => ITEMS[r.target].name);
  const facilities = FACILITIES.filter(f => f.need[id]).map(f => f.name);
  if (recipes.length) lines.push('제작·요리 재료 · ' + recipes.join(', '));
  if (facilities.length) lines.push('거점 설비 재료 · ' + facilities.join(', '));
  return lines.map(line => '<p class="tiny" style="margin:8px 0 0">' + esc(line) + '</p>').join('');
}
