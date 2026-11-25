export function upgradeRest(html) {
  const edits = [
    ["function basePage(){","const REST_EFFECTS = {\n bed: {hp:9,sp:12}, lamp:{sp:3}, bench:{minutes:1}, stove:{sp:3},\n radio:{minutes:1}, med:{hp:9}, barricade:{minutes:2}, filter:{hp:3,sp:3,minutes:1}\n};\nfunction restStats() {\n const result={hp:3,sp:6,minutes:15};\n for(const [id,effect] of Object.entries(REST_EFFECTS)) {\n   if(!hasFacility(id)) continue;\n   result.hp+=effect.hp||0;\n   result.sp+=effect.sp||0;\n   result.minutes-=effect.minutes||0;\n }\n return result;\n}\nfunction restBonus(f) {\n const e=REST_EFFECTS[f.id], parts=[];\n if(f.id==='bench') parts.push('작업대 제작 해금');\n if(f.id==='stove') parts.push('버너 요리 해금');\n if(e.hp) parts.push('휴식 HP +'+e.hp);\n if(e.sp) parts.push('휴식 SP +'+e.sp);\n if(e.minutes) parts.push('휴식 대기 −'+e.minutes+'분');\n return parts.join(' · ');\n}\nfunction remainingRest(u,minutes) {\n return Math.max(0,(Number(u.lastRest)||0)+minutes*60000-Date.now());\n}\nfunction tickRest() {\n const status=document.getElementById('nextRest');\n if(!status)return;\n const wait=remainingRest(me(),restStats().minutes);\n const label=wait?Math.ceil(wait/60000)+'분 후 가능':'휴식 가능';\n if(status.textContent!==label)status.textContent=label;\n const btn=document.querySelector('[data-action=\"rest\"]');\n if(btn)btn.disabled=me().location!=='sewer'||wait>0;\n}\n\nfunction basePage(){"],
    ["const restWait=Math.max(0,15*60000-(Date.now()-u.lastRest));","const rest=restStats(),restWait=remainingRest(u,rest.minutes);"],
    ["${done?`<div class=\"good tiny\">✓ ${f.bonus}</div>`:`<div class=\"facility-materials\">","<p class=\"tiny ${done?'good':'muted'}\">${done?'적용 중':'설치 효과'} · ${restBonus(f)}</p>${done?'':`<div class=\"facility-materials\">"],
    ["침구와 의료 설비를 갖출수록 휴식 효과가 좋아져. 15분에 한 번 쉴 수 있어.","설비 효과는 두 생존자에게 누적돼. 각자 마지막 휴식부터 ${rest.minutes}분 뒤에 다시 쉴 수 있어."],
    ["HP +${3+(hasFacility('bed')?9:0)+(hasFacility('med')?9:0)} / SP +${6+(hasFacility('bed')?12:0)+(hasFacility('lamp')?3:0)}","HP +${rest.hp} / SP +${rest.sp}"],
    ["<span>마지막 휴식</span><b>${restWait","<span>다음 휴식</span><b id=\"nextRest\">${restWait"],
    ["if(Date.now()-u.lastRest<15*60000){notify('휴식은 15분에 한 번 가능해.');return}u.hp=Math.min(100,u.hp+3+(hasFacility('bed')?9:0)+(hasFacility('med')?9:0));u.sp=Math.min(100,u.sp+6+(hasFacility('bed')?12:0)+(hasFacility('lamp')?3:0));","const rest=restStats();if(remainingRest(u,rest.minutes)>0){notify('아직 휴식 대기 중이야.');return}const hp=Math.min(rest.hp,100-u.hp),sp=Math.min(rest.sp,100-u.sp);u.hp+=hp;u.sp+=sp;"],
    ["notify('휴식 완료 · 출혈은 붕대로 치료해야 해.')","notify('휴식 완료 · HP +'+hp+' / SP +'+sp+' · 다음 휴식 '+rest.minutes+'분 후')"],
    ["const fogChanged=advanceFogCycle();","tickRest();const fogChanged=advanceFogCycle();"]
  ];
  for (const [before, after] of edits) {
    if (!html.includes(before)) throw Error('Missing shelter hook: '+before);
    html = html.replace(before, () => after);
  }
  return html;
}
