(() => {
const lorePages = [
  { label: '월드', icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', body: '<h3>유독성 안개와 감염자</h3><p>도시에는 지금도 주기적으로 유독성 안개가 밀려든다. 안개가 짙은 동안에는 방독면을 갖춰야 밖을 다닐 수 있다.</p><p>안개가 걷히면 생존자들은 식량과 약을 구하러 나선다. 버려진 상가와 진료소에는 아직 쓸 만한 물자가 남아 있고, 감염자들도 그곳을 배회한다.</p>' },
  { label: '히스토리', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', body: '<h3>종말의 날</h3><p>짙은 안개가 며칠이고 걷히지 않았다. 사람들은 메스꺼움을 호소했고, 길에서 구토를 하거나 그대로 쓰러지는 이들이 나날이 늘었다. 각국 정부가 안개의 성분을 조사하던 어느 날, 모처럼 하늘이 맑게 갰다.</p><p>그날, 사람들은 친구를, 가족을, 연인을, 이웃을 물어뜯기 시작했다. 세계 곳곳에서 같은 일이 한꺼번에 벌어졌다. 사람들은 영문도 모른 채 달아났고, 물린 이들은 이윽고 누군가를 물어뜯기 위해 거리를 배회했다.</p><h3>종말로부터 1년</h3><p>정부는 힘을 잃었다. 살아남은 이들은 저마다 작은 무리를 이루거나 홀로 떠돌았다. 한 끼 식량을 위해 남의 거처를 털고, 약 한 병을 두고 서로를 죽이는 일이 흔해졌다. 모두가 가엾고, 모두가 죄인인 세상이 되었다.</p><p>그래도 아직 희망을 놓지 못한 이들이 있다. 그들은 오늘도 살아남기 위해 거리로 나선다.</p>' },
  { label: '챕터 0', icon: '<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>', body: '<h3>B-03 배수로 생활권</h3><p>하천 옆 배수로에 두 사람이 자리를 잡았다. 첫 목표는 다음 안개가 오기 전에 방독면 두 개를 구하는 것. 하나씩 쓰고 함께 돌아올 수 있도록.</p><p>축축한 바닥에 놓인 침상, 어둠을 밝히는 벽등, 늦는 사람을 기다리며 켜 둔 무전기. 그저 몸을 피하던 곳이 조금씩 둘의 집이 되어 간다.</p>' },
];

function installHomeLore(doc) {
  if (doc.getElementById('ash-lore-dialog')) return;
  const style = doc.createElement('style');
  style.textContent = `
    .cinematic-entry .ash-home-signature {display:flex;flex-direction:column;align-items:flex-start}
    .ash-home-signature::after {order:1}
    .ash-home-signature .ash-lore-tools {order:2;display:flex;gap:4px;margin-top:3px;pointer-events:auto;width:max-content;transform:rotate(1.5deg)}
    .ash-lore-tools button {display:grid;place-items:center;width:26px;height:28px;padding:0;border:0;background:transparent;box-shadow:none;color:#d1edec;cursor:pointer}
    .ash-lore-tools svg {width:14px;height:14px;filter:drop-shadow(0 1px 2px #071116)}
    .ash-lore-tools button:hover,.ash-lore-tools button:focus-visible {color:white}
    .ash-lore-tools button:focus-visible {outline:1px solid currentColor;outline-offset:-2px}
    @media(pointer:coarse){.ash-lore-tools button{width:44px;height:44px}}
    #ash-lore-dialog {position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(480px,calc(100% - 32px));height:fit-content;max-height:78dvh;padding:0;border:1px solid #77bbbb;border-radius:0;background:#101e27;color:#dce8e9;box-shadow:0 0 19px #62b7bb40,0 14px 60px #02080dbb;overflow:auto;text-align:left;color-scheme:dark}
    #ash-lore-dialog[open] {animation:ash-lore-open .22s ease-out}
    #ash-lore-dialog::backdrop {background:#030a1099}
    #ash-lore-dialog header {position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:8px 15px;background:#172e36;border-bottom:1px solid #375861}
    #ash-lore-dialog h2 {margin:0;color:#bfebea;font:600 15px/1.5 system-ui}
    #ash-lore-dialog button {background:none;border:0;color:#cbe9e8;font:22px/1 system-ui;cursor:pointer;width:36px;height:36px}
    #ash-lore-dialog article {padding:20px clamp(18px,5vw,30px) 24px}
    #ash-lore-dialog h3 {margin:0 0 10px;color:#aedad9;font:600 15px/1.5 system-ui}
    #ash-lore-dialog p {margin:0 0 12px;font:14px/1.85 system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere}
    #ash-lore-dialog p+h3 {margin-top:24px}
    #ash-lore-dialog p:last-child {margin-bottom:0}
    @keyframes ash-lore-open {from{clip-path:inset(48% 8%);transform:translateY(4px)}to{clip-path:inset(0);transform:none}}
    @media(prefers-reduced-motion:reduce){#ash-lore-dialog[open]{animation:none}}
  `;
  doc.head.append(style);
  const dialog = doc.createElement('dialog');
  dialog.id = 'ash-lore-dialog';
  dialog.setAttribute('aria-labelledby', 'ash-lore-title');
  dialog.innerHTML = '<header><h2 id="ash-lore-title"></h2><button type="button" aria-label="닫기">×</button></header><article></article>';
  doc.body.append(dialog);
  const title = dialog.querySelector('h2');
  const article = dialog.querySelector('article');
  dialog.querySelector('button').onclick = () => dialog.close();
  const controls = doc.createElement('span');
  controls.className = 'ash-lore-tools';
  lorePages.forEach(page => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.title = page.label;
    button.setAttribute('aria-label', page.label);
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + page.icon + '</svg>';
    button.onclick = () => {
      const n = page === lorePages[2] ? Number(doc.documentElement.dataset.chapter || 0) : 0;
      title.textContent = n ? '챕터 '+n : page.label;
      article.innerHTML = n === 1 ? '<h3>안개 속 수색</h3><p>두 사람 몫의 방독면을 확보했다. 안개 속 보급 신호를 따라가 단서 세 가지를 모으자.</p>' : n === 2 ? '<h3>동광장의 교역상</h3><p>중앙로역 승강장에서 교역상의 접선 표식을 확인하자.</p>' : page.body;
      dialog.showModal();
      dialog.scrollTop = 0;
    };
    controls.append(button);
  });
  const attach = () => {
    const chapterButton = controls.lastElementChild;
    chapterButton.title = '챕터 '+(doc.documentElement.dataset.chapter || 0);
    chapterButton.setAttribute('aria-label',chapterButton.title);
    const signature = doc.querySelector('.cinematic-entry .ash-home-signature');
    if (signature && controls.parentElement !== signature) signature.append(controls);
    if (!signature && dialog.open) dialog.close();
  };
  attach();
  const observer = new MutationObserver(attach);
  observer.observe(doc.getElementById('app') || doc.body, { childList:true, subtree:true });
  doc.defaultView?.addEventListener('pagehide', () => observer.disconnect(), { once:true });
}


installHomeLore(document);
})();