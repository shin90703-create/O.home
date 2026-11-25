export function characterViews(html) {
  const edits = [
    ["const currentName=me().name;","const companion=other();"],
    ["const title=at?","const withPartner=curProfile(companion).registered && state.users[companion].location===id;\n   const occupants=[at?me().name:'',withPartner?state.users[companion].name:''].filter(Boolean).join(' · ');\n   const title=at?"],
    ["${at?`<span class=\"district-you\">내 위치 · ${esc(currentName)}</span>`:''}","${occupants?`<span class=\"district-you\">${esc(occupants)}</span>`:''}"],
    ["${esc(title)} 선택","${esc(title)} ${esc(occupants)} 선택"],
    ["return src?`<img src=\"${src}\" alt=\"\">`:esc(id);","return src?croppedFace(src,faceCrop(curProfile(id))):esc(id);"],
    ["'SYS':m.from}</div>","'SYS':faceMarkup(m.from)}</div>"],
    ["registered:true};state.profiles[id]=p;","registered:true,...(ui.faceDraft||faceCrop(prior))};ui.faceDraft=null;state.profiles[id]=p;"],
    ["case 'profileEdit':","case 'profileEdit':ui.faceDraft=null;"],
    ["if(e.target.id==='charImage')ui.profileUpload=image;","if(e.target.id==='charImage'){ui.profileUpload=image;previewFace()}"],
    ["이전 등록 그림만 초기화 (저장 시 적용)</button></div>","이전 등록 그림만 초기화 (저장 시 적용)</button>${faceEditor(p)}</div>"],
    ["save();syncBgm();updateWeatherDisplay()","previewFace();save();syncBgm();updateWeatherDisplay()"],
    ["<div class=\"over\" style=\"margin-bottom:8px\">SPEAKER: ${esc(me().name)} // OWN CHARACTER ONLY</div>","${speakerControls()}"],
    ["r.messages.push({id:Date.now(),from:state.active,time:stamp(),text});","r.messages.push({id:Date.now(),from:state.active,time:stamp(),text,kind:ui.rpSpeaker==='narration'?'narration':'character'});"],
    ["class=\"rp-message ${mine?","class=\"rp-message ${m.kind==='narration'?'narration':''} ${mine?"],
    ["${esc(state.users[m.from]?.name||m.from)} · ${esc(m.time)}","${esc(speakerName(m))} · ${esc(m.time)}"],
    ["${state.users[m.from]?.name||m.from}\\n${m.text}","${speakerName(m)}\\n${m.text}"],
    ["const nick=state.users[m.from]?.name||curProfile(m.from)?.name||m.from;","const nick=speakerName(m);"],
    ["rp-log-message speaker-${idx}","rp-log-message ${m.kind==='narration'?'narration':''} speaker-${idx}"]
  ];
  for(const [before,after] of edits){
    if(!html.includes(before)) throw Error('Missing ASHLINE markup: '+before);
    html=html.replace(before,()=>after);
  }
  return html.replace('</head>',()=>'<style>'+".speaker-picker{display:flex;align-items:center;gap:6px;margin-bottom:8px}.speaker-picker button[aria-pressed=true]{border-color:#94cccb;background:#25434a;color:#e2f6ef}.rp-message.narration{align-self:center;max-width:95%}.narration .rp-avatar,.narration .rp-log-avatar{display:none}.narration .rp-balloon{background:transparent;border:0;text-align:center}.narration .rp-nick{text-align:center}.face-editor{margin-top:16px;display:grid;grid-template-columns:88px minmax(0,1fr);gap:14px;align-items:center;border:1px solid #39525b}.face-editor label{display:flex;align-items:center;gap:6px}.face-editor input{flex:1;min-width:0}.face-editor legend{font-size:12px}.face-editor #facePreview{width:88px;height:88px;background:#11212a;overflow:hidden}.radio .face,.rp-log-avatar{overflow:hidden}"+'</style></head>');
}
