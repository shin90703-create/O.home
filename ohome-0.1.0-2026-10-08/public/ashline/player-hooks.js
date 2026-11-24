(() => {
  const limit = 3;
  function allowance() {
    if (!toxicFogActive()) return null;
    const live = liveToxicFog();
    const field = live ? 'fogSearchQuota' : 'previewFogSearchQuota';
    const cycle = live ? fogCycle.activeUntil : fogCycle.nextStart;
    const record = me()[field];
    const used = record?.cycle === cycle ? record.used : 0;
    return { field, cycle, used, left: Math.max(0, limit - used) };
  }

  const originalChoose = chooseMission;
  chooseMission = function(action) {
    const quota = action === 'search' ? allowance() : null;
    if (!quota) return originalChoose(action);
    const session = state.session;
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
    const label = '안개 수색 ' + quota.left + '/' + limit;
    const gear = document.querySelector('.fog-global-alert .fog-gear');
    if (gear) gear.textContent = '방독면 장착 · ' + label;
    const button = document.querySelector('button[data-move="search"]');
    if (button) {
      button.textContent = '◇ 주변 수색 · ' + quota.left + '/' + limit;
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
              if (window.__ashlineTwoMaskGoal) return;
              window.__ashlineTwoMaskGoal = true;
              const refreshGoal = () => {
                const goal = document.querySelector('.ash-base-goal');
                if (!goal) return;
                let masks = 0;
                try {
                  masks = Object.values(state.users).reduce((sum, person) =>
                    sum + count(person, 'gasmask'), 0);
                } catch (_) { return; }
                const done = masks >= 2;
                goal.classList.toggle('completed', done);
                const title = goal.querySelector('.goal-text strong');
                const label = '1차 목표 · 방독면 2개 구하기';
                if (title && title.textContent !== label) title.textContent = label;
                const check = goal.querySelector('.goal-check');
                const glyph = done ? '✓' : '○';
                if (check && check.textContent !== glyph) check.textContent = glyph;
                const status = goal.querySelector('.goal-state');
                const message = done
                  ? '완료 · 방독면 2/2 확보'
                  : '진행 중 · 방독면 ' + Math.min(masks, 2) + '/2 확보';
                if (status) {
                  let progress = status.querySelector('.ash-mask-goal-progress');
                  if (!progress) {
                    progress = document.createElement('span');
                    progress.className = 'ash-mask-goal-progress';
                    status.appendChild(progress);
                  }
                  // Hide the old one-mask status string while leaving its check icon.
                  Array.from(status.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                      node.textContent = '';
                    }
                  });
                  if (progress.textContent !== message) progress.textContent = message;
                }
                const aria = label + ' ' + (done ? '완료' : '미완료') + ' (' + Math.min(masks, 2) + '/2)';
                if (goal.getAttribute('aria-label') !== aria) goal.setAttribute('aria-label', aria);
              };
              new MutationObserver(refreshGoal).observe(document.getElementById('app') || document.body, {
                childList: true, subtree: true
              });
              refreshGoal();
            })();