(() => {
  const limit = 3;
  function allowance() {
    if (!toxicFogActive()) return null;
    const live = liveToxicFog();
    const field = live ? 'fogSearchQuota' : 'previewFogSearchQuota';
    const cycle = live ? fogCycle.activeUntil : fogCycle.nextStart;
    const record = me()[field];
    const used = record?.cycle === cycle ? record.used : 0;
    const total = limit + Number(live && me().filterCycle === cycle);
    return { field, cycle, used, total, left: Math.max(0, total - used) };
  }

  const originalChoose = chooseMission;
  chooseMission = function(action) {
    const quota = action === 'search' ? allowance() : null;
    if (!quota) return originalChoose(action);
    const session = myMission();
    const user = me();
    if (!session || session.status !== 'active' || !session.participants.includes(state.active)
        || session.actions[state.active] || fogBlocks(user) || user.sp < 4) return originalChoose(action);
    if (session.enemyHp > 0) return;
    if (!quota.left) {
      notify('이번 안개의 수색 횟수를 모두 사용했어. 다음 안개에는 3회로 회복돼.');
      return;
    }
    // The original action saves the character and the accepted turn together.
    user[quota.field] = { cycle: quota.cycle, used: quota.used + 1 };
    return originalChoose(action);
  };

  function displayQuota() {
    const quota = allowance();
    if (!quota || !maskEquipped(me())) return;
    const label = '안개 수색 ' + quota.left + '/' + quota.total;
    const gear = document.querySelector('.fog-global-alert .fog-gear');
    if (gear) gear.textContent = '방독면 장착 · ' + label;
    const button = document.querySelector('button[data-move="search"]');
    if (button) {
      button.textContent = '◇ 주변 수색 · ' + quota.left + '/' + quota.total;
      if (!quota.left) button.disabled = true;
    }
  }
  const originalRender = render;
  render = function() {
    originalRender();
    displayQuota();
  };
  displayQuota();
})();
(() => {
  const style = document.createElement('style');
  style.textContent = `
    [data-radio-unread]{position:relative;overflow:visible}
    [data-radio-unread]::after{content:'';position:absolute;right:1px;top:1px;width:7px;height:7px;border-radius:50%;background:#ff956e;box-shadow:0 0 0 1.5px #14212a;pointer-events:none}
  `;
  document.head.append(style);
  let cachedKey = '', cache = null;
  function update() {
    const home = window.frameElement?.dataset.radioHome;
    if (!ashlineConnected || !home || !ashlineSlot) return;
    const key = 'ashline.radio.read.v1.' + encodeURIComponent(home) + '.' + ashlineSlot;
    if (key !== cachedKey) { cachedKey = key; cache = null; }
    try { cache = localStorage.getItem(key) ?? cache; } catch {}
    let read;
    try { read = new Set(JSON.parse(cache)); } catch { read = new Set(); }
    const partner = ashlineSlot === 'A' ? 'B' : 'A';
    const messages = state.messages.filter(m => m.from === partner && m.id != null);
    const unread = new Set(), kept = [];
    for (const m of messages) {
      const id = String(m.id);
      const viewing = !document.hidden && ui.radio && !ui.radioMin && ui.radioTab === m.channel;
      if (cache === null || read.has(id) || viewing) kept.push(id);
      else unread.add(m.channel);
    }
    const next = JSON.stringify(kept);
    if (cache !== next) {
      cache = next;
      try { localStorage.setItem(key,next); } catch {}
    }
    for (const button of document.querySelectorAll('[data-action="radio"],[data-action="missionRadio"],[data-radiotab]')) {
      const channel = button.dataset.radiotab || (button.dataset.action === 'missionRadio' ? 'mission' : '');
      const active = channel ? unread.has(channel) : unread.size > 0;
      button.toggleAttribute('data-radio-unread',active);
      const label = button.dataset.radioLabel || button.getAttribute('aria-label') || button.title || button.textContent.trim();
      button.dataset.radioLabel = label;
      button.setAttribute('aria-label',label + (active ? ' · 새 무전 있음' : ''));
    }
  }
  const renderGame = render;
  render = function() { renderGame(); update(); };
  document.addEventListener('visibilitychange',update);
  window.addEventListener('storage', event => { if (event.key === cachedKey) update(); });
})();
