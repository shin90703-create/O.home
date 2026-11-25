const recoveryInterval = 5 * 60 * 1000;
function recoverSurvivors(now) {
  const since = state.recoveryAt;
  if (!Number.isFinite(since) || since <= 0 || since > now) {
    state.recoveryAt = now;
    return false;
  }
  const points = Math.floor((now - since) / recoveryInterval);
  if (!points) return false;
  state.recoveryAt = since + points * recoveryInterval;
  for (const survivor of Object.values(state.users)) {
    survivor.hp = Math.min(100, survivor.hp + points);
    survivor.sp = Math.min(100, survivor.sp + points);
  }
  return true;
}

function vitalValue(user, stat) {
  const slot = user === state.users.A ? 'A' : 'B';
  return '<span data-vital-slot="' + slot + '" data-stat="' + stat + '">' + user[stat] + '</span>';
}

function updateRecovery() {
  if (!ashlineConnected || !recoverSurvivors(Date.now())) return;
  for (const el of document.querySelectorAll('[data-vital-slot]')) {
    el.textContent = state.users[el.dataset.vitalSlot][el.dataset.stat];
  }
  for (const el of document.querySelectorAll('[data-hp-meter]')) {
    el.style.width = state.users[el.dataset.hpMeter].hp + '%';
  }
}

// Shared snapshots carry the clock. Between saves both players can derive the
// same elapsed recovery without racing each other for a background write.
const renderBeforeRecovery = render;
render = function() {
  if (ashlineConnected) recoverSurvivors(Date.now());
  renderBeforeRecovery();
};
setInterval(updateRecovery, 1000);
document.addEventListener('visibilitychange', updateRecovery);
document.addEventListener('click', updateRecovery, true);
document.addEventListener('keydown', updateRecovery, true);
