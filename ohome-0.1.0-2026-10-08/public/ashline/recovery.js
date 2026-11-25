function recoverStat(now, stat, clock, interval) {
  const since = state[clock];
  if (!Number.isFinite(since) || since <= 0 || since > now) {
    state[clock] = now;
    return false;
  }
  const points = Math.floor((now - since) / interval);
  if (!points) return false;
  state[clock] = since + points * interval;
  for (const survivor of Object.values(state.users)) {
    survivor[stat] = Math.min(100, survivor[stat] + points);
  }
  return true;
}

function recoverSurvivors(now) {
  // Existing saves used the HP clock for both stats.
  state.spRecoveryAt ??= state.recoveryAt;
  const hpChanged = recoverStat(now, 'hp', 'recoveryAt', 300000);
  const spChanged = recoverStat(now, 'sp', 'spRecoveryAt', 180000);
  return hpChanged || spChanged;
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
