(() => {
  const allowed = new Set(['profilePick','profileDetail','openRoom','archiveTab','viewScript','closeScript','viewGallery','closeGallery','toggleStickyComments']);
  const hidden = ['[data-context-kind="radio"]','.rp-composer','.sticky-editor','.sticky-menu','#bgmMount','.role-list ~ form','[data-radiotab]','textarea','input','select','[data-move]','.role-layout .form-field'];
  const style=document.createElement('style');
  style.textContent=hidden.join(',')+'{display:none!important}[data-action]{display:none!important}'+Array.from(allowed,a=>'[data-action="'+a+'"]').join(',')+'{display:revert!important}';
  document.head.append(style);
  // The sandbox has no authenticated bridge. Keep all observer interaction local.
  ashlineFlush=()=>{};
  refreshIfNeeded=()=>false;
  advanceFogCycle=()=>false;
  const oldAct=act;
  act=function(name,...args){if(allowed.has(name))return oldAct(name,...args)};
  for(const type of ['contextmenu','submit','change','touchstart','keydown','click']){
    document.addEventListener(type,e=>{
      const node=e.target.closest?.('button,input,select,textarea,[data-action],[data-context-kind]');
      const action=node?.closest('[data-action]')?.dataset.action;
      if(type==='contextmenu'||type==='submit'||type==='change'||
         (type==='touchstart'&&node?.closest('[data-context-kind]'))||
         (type==='keydown'&&(e.key==='ContextMenu'||e.key==='F10'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))))||
         (type==='click'&&((action&&!allowed.has(action))||node?.matches('[data-move]')))){
        if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();
      }
    },true);
  }
  let game;
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.data?.type!=='ASHLINE_WATCH_STATE')return;
    game=e.data.game;
    if(!game)return;
    const profile=ui.profileId, selected=state.active==='B'?'B':'A';
    const empty=blank();
    for(const id of ['A','B']) game.users[id]={...empty.users[id],...game.users[id]};
    ashlineApply(game,e.data.revision,selected);
    ashlineConnected=false;
    ui.profileId=profile || selected;
    ui.radio=false;
    render();
  });
  parent.postMessage({type:'ASHLINE_WATCH_READY'},'*');
})();