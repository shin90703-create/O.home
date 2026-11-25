// Drafts belong to this tab and player, outside the shared game snapshot.
let draftNamespace = '', draftBook = {};
function loadDraftBook(slot) {
  const data = window.frameElement?.dataset;
  const key = JSON.stringify(['ashline.rp.drafts.v1', data?.radioHome, data?.draftOwner, slot]);
  if (draftNamespace === key) return;
  draftNamespace = key;
  try { draftBook = JSON.parse(sessionStorage.getItem(key)) || {}; }
  catch { draftBook = {}; }
}
function persistDrafts() {
  try { sessionStorage.setItem(draftNamespace, JSON.stringify(draftBook)); } catch {}
}
function fieldKey(field) {
  return JSON.stringify([field.dataset.rpRoom, field.dataset.rpEdit || null]);
}
function draftFor(field) {
  return draftBook[fieldKey(field)] ||= {text:null, pending:[]};
}
function rememberField(field) {
  if (!field?.dataset.rpRoom) return;
  const draft = draftFor(field);
  draft.text = field.value;
  draft.speaker = ui.rpSpeaker;
  persistDrafts();
}
function submittedField(field, message) {
  const draft = draftFor(field);
  draft.pending.push({id:String(message.id), text:field.value, speaker:ui.rpSpeaker});
  draft.text = null;
  persistDrafts();
}
function discardEdit() {
  const field = document.getElementById('rpEditInput');
  if (field) {
    const draft = draftFor(field);
    draft.text = null;
    if (!draft.pending.length) delete draftBook[fieldKey(field)];
    persistDrafts();
  }
}
function reconcileDrafts(payload, restoreMissing) {
  let changed = false;
  for (const [key,draft] of Object.entries(draftBook)) {
    if (!draft.pending.length) continue;
    const [roomId] = JSON.parse(key);
    const messages = payload?.roleplays?.find(r => String(r.id) === roomId)?.messages || [];
    const missing = [], remaining = [];
    for (const entry of draft.pending) {
      if (messages.some(m => String(m.id) === entry.id && m.text === entry.text.trim())) changed = true;
      else if (restoreMissing) { missing.push(entry); changed = true; }
      else remaining.push(entry);
    }
    draft.pending = remaining;
    if (missing.length) {
      if (!draft.text) draft.speaker = missing[0].speaker;
      draft.text = [...missing.map(m => m.text),draft.text].filter(Boolean).join('\n\n');
    }
    if (!draft.pending.length && draft.text === null) delete draftBook[key];
  }
  if (changed) persistDrafts();
}
document.addEventListener('input',e => rememberField(e.target));
document.addEventListener('click',e => {
  if (e.target.closest('[data-rp-speaker]')) rememberField(document.getElementById('rpInput'));
});
let composingField, deferredDraftRender = false;
document.addEventListener('compositionstart',e => {
  if (e.target.dataset.rpRoom) composingField = e.target;
});
document.addEventListener('compositionend',e => {
  if (e.target !== composingField) return;
  rememberField(e.target);
  composingField = null;
  if (deferredDraftRender) {
    deferredDraftRender = false;
    queueMicrotask(render);
  }
});
const renderWithGameHooks = render;
render = function() {
  if (composingField?.isConnected && document.activeElement === composingField) {
    deferredDraftRender = true;
    return;
  }
  const active = document.activeElement;
  const selection = active?.dataset?.rpRoom ? [fieldKey(active),active.selectionStart,active.selectionEnd,active.selectionDirection] : null;
  renderWithGameHooks();
  for (const field of document.querySelectorAll('textarea[data-rp-room]')) {
    const key = fieldKey(field), draft = draftBook[key];
    if (draft?.text != null) field.value = draft.text;
    if (!field.dataset.rpEdit && draft?.speaker) {
      ui.rpSpeaker = draft.speaker;
      for (const button of document.querySelectorAll('[data-rp-speaker]'))
        button.setAttribute('aria-pressed',String(button.dataset.rpSpeaker === draft.speaker));
    }
    if (selection && selection[0] === key) {
      field.focus({preventScroll:true});
      field.setSelectionRange(selection[1],selection[2],selection[3]);
    }
  }
};
