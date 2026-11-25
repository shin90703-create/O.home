function speakerName(message) {
  return message.kind === 'narration' ? '나레이션' : state.users[message.from]?.name || message.from;
}
function speakerControls() {
  const narration = ui.rpSpeaker === 'narration';
  return '<div class="speaker-picker" role="group" aria-label="화자 선택"><span>화자</span>' +
    [['character',me().name],['narration','나레이션']].map(([key,label]) =>
      '<button type="button" class="btn small outline" data-rp-speaker="'+key+'" aria-pressed="'+((key==='narration')===narration)+'">'+esc(label)+'</button>').join('')+'</div>';
}
function faceCrop(profile) {
  const val = (v, initial, lo, hi) => Number.isFinite(v) ? Math.min(hi, Math.max(lo,v)) : initial;
  return {faceX:val(profile.faceX,50,0,100),faceY:val(profile.faceY,50,0,100),faceZoom:val(profile.faceZoom,1,1,5)};
}
function croppedFace(src,crop) {
  if (!src) return '';
  const pos=crop.faceX+'% '+crop.faceY+'%';
  return '<img alt="" src="'+esc(src)+'" style="display:block;width:100%;height:100%;object-fit:cover;object-position:'+pos+';transform-origin:'+pos+';transform:scale('+crop.faceZoom+')">';
}
function faceEditor(profile) {
  const crop=ui.faceDraft || faceCrop(profile);
  const sliders=[['faceX','좌우',0,100,1],['faceY','상하',0,100,1],['faceZoom','확대',1,5,.05]];
  return '<fieldset class="face-editor"><legend>역극·무전용 얼굴 영역</legend><div id="facePreview"></div><div>'+
    sliders.map(([key,label,min,max,step])=>'<label>'+label+'<input type="range" data-face-axis="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+crop[key]+'"></label>').join('')+'</div></fieldset>';
}
function previewFace() {
  const preview=document.getElementById('facePreview');
  if (!preview) return;
  const p=curProfile(state.active);
  const src=ui.profileUpload==='__RESET__'?'':ui.profileUpload||p.image;
  preview.innerHTML=croppedFace(src,ui.faceDraft||faceCrop(p));
}
document.addEventListener('input',e=>{
  const axis=e.target.dataset.faceAxis;
  if (!['faceX','faceY','faceZoom'].includes(axis)) return;
  ui.faceDraft={...(ui.faceDraft||faceCrop(curProfile(state.active))),[axis]:Number(e.target.value)};
  previewFace();
});
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-rp-speaker]');
  if(!button)return;
  ui.rpSpeaker=button.dataset.rpSpeaker;
  for(const b of button.parentElement.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b===button));
});
