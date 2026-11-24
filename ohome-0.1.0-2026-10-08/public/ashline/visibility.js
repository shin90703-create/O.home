(() => {
  function attach(host, entry) {
    if (!host || !entry || host.querySelector('.spectator-visibility')) return;
    const button = document.createElement('button');
    button.className = 'btn small outline spectator-visibility';
    button.type = 'button';
    button.textContent = entry.spectatorPublic === true ? '관전자에게 공개 중' : '관전자에게 비공개';
    button.setAttribute('aria-pressed',String(entry.spectatorPublic === true));
    button.onclick = e => {
      e.stopPropagation();
      entry.spectatorPublic = entry.spectatorPublic !== true;
      render();
    };
    host.append(button);
  }
  function refresh() {
    for (const action of document.querySelectorAll('[data-action="finishRoom"],[data-action="viewScript"],[data-action="deleteSticky"]')) {
      const note = action.dataset.action === 'deleteSticky';
      const entry = (note ? state.notes : state.roleplays).find(row=>String(row.id)===action.dataset.id);
      if (!entry || (note ? (entry.author || 'A') : (entry.creator || 'A')) !== state.active) continue;
      attach(action.parentElement,entry);
    }
  }
  new MutationObserver(refresh).observe(document.getElementById('app') || document.body,{subtree:true,childList:true});
  refresh();
})();