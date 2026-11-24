'use client';

/** ASHLINE chapter 1: O.HOME authenticated integration entry.
 * The authenticated shell owns Firestore access. The ASHLINE presentation iframe
 * never receives credentials, access tokens or backend configuration.
 */
import React, { useEffect, useRef, useState } from 'react';
import { getApp } from 'firebase/app';
import { doc, getDoc, getFirestore, onSnapshot, runTransaction } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { backend, isServerMode } from '@/lib/backend';
import { currentHomeId, leaveHome, chooseAnotherMemberHome } from '@/lib/home';
import { serverConfig } from '@/lib/serverConfig';
import { AshlineMusic, type AshlineTrack } from '@/components/ashline/AshlineMusic';

import { armMsgSound, playMsgTone, unlockMsgSound } from '@/lib/msgSound';

type Slot = 'A' | 'B';
type World = {
  slots: { A: string; B: string | null };
  revision: number;
  payload: Record<string, unknown> | null;
  updatedAt: number;
};
type IframeMsg = {
  type?: string;
  payload?: Record<string, unknown>;
  expectedRevision?: number;
  requestId?: string;
  blob?: Blob;
};

/** Track metadata is shared; each visitor controls playback independently. */
type MusicList = { tracks: AshlineTrack[]; index: number };
function musicFromWorld(payload: Record<string, unknown> | null): MusicList {
  const raw = payload?.bgm;
  if (!raw || typeof raw !== 'object') return { tracks: [], index: 0 };
  const bgm = raw as { tracks?: unknown; index?: unknown };
  const tracks: AshlineTrack[] = Array.isArray(bgm.tracks)
    ? bgm.tracks.filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .filter(t => typeof t.ytid === 'string' && (
          (t.kind === 'video' && /^[A-Za-z0-9_-]{11}$/.test(t.ytid))
          || (t.kind === 'list' && /^[A-Za-z0-9_-]{8,100}$/.test(t.ytid))
        ))
        .map(t => ({ title: typeof t.title === 'string' ? t.title : 'BGM', ytid: t.ytid as string,
          kind: t.kind as 'video' | 'list' }))
    : [];
  return { tracks, index: Math.max(0, Math.min(tracks.length - 1, Number(bgm.index) || 0)) };
}

function partnerRoleplayEntries(payload: World['payload'], viewer: Slot): Map<string, string> {
  const entries = new Map<string, string>();
  const partner = viewer === 'A' ? 'B' : 'A';
  if (!Array.isArray(payload?.roleplays)) return entries;
  for (const room of payload.roleplays) {
    if (!room?.id || !Array.isArray(room.participants) || !room.participants.includes(viewer)) continue;
    if (room.creator === partner) entries.set(JSON.stringify([room.id]), String(room.title ?? ''));
    if (!Array.isArray(room.messages)) continue;
    for (const message of room.messages) {
      if (message?.from === partner && message.id != null && typeof message.text === 'string') {
        entries.set(JSON.stringify([room.id, message.id]), message.text);
      }
    }
  }
  return entries;
}

const lorePages = [
  { label: '월드', icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>', body: '<h3>유독성 안개와 감염자</h3><p>도시에는 지금도 주기적으로 유독성 안개가 밀려든다. 안개가 짙은 동안에는 방독면을 갖춰야 밖을 다닐 수 있다.</p><p>안개가 걷히면 생존자들은 식량과 약을 구하러 나선다. 버려진 상가와 진료소에는 아직 쓸 만한 물자가 남아 있고, 감염자들도 그곳을 배회한다.</p>' },
  { label: '히스토리', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', body: '<h3>종말의 날</h3><p>짙은 안개가 며칠이고 걷히지 않았다. 사람들은 메스꺼움을 호소했고, 길에서 구토를 하거나 그대로 쓰러지는 이들이 나날이 늘었다. 각국 정부가 안개의 성분을 조사하던 어느 날, 모처럼 하늘이 맑게 갰다.</p><p>그날, 사람들은 친구를, 가족을, 연인을, 이웃을 물어뜯기 시작했다. 세계 곳곳에서 같은 일이 한꺼번에 벌어졌다. 사람들은 영문도 모른 채 달아났고, 물린 이들은 이윽고 누군가를 물어뜯기 위해 거리를 배회했다.</p><h3>종말로부터 1년</h3><p>정부는 힘을 잃었다. 살아남은 이들은 저마다 작은 무리를 이루거나 홀로 떠돌았다. 한 끼 식량을 위해 남의 거처를 털고, 약 한 병을 두고 서로를 죽이는 일이 흔해졌다. 모두가 가엾고, 모두가 죄인인 세상이 되었다.</p><p>그래도 아직 희망을 놓지 못한 이들이 있다. 그들은 오늘도 살아남기 위해 거리로 나선다.</p>' },
  { label: '챕터 0', icon: '<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>', body: '<h3>B-03 배수로 생활권</h3><p>하천 옆 배수로에 두 사람이 자리를 잡았다. 첫 목표는 다음 안개가 오기 전에 방독면 두 개를 구하는 것. 하나씩 쓰고 함께 돌아올 수 있도록.</p><p>축축한 바닥에 놓인 침상, 어둠을 밝히는 벽등, 늦는 사람을 기다리며 켜 둔 무전기. 그저 몸을 피하던 곳이 조금씩 둘의 집이 되어 간다.</p>' },
];

function installHomeLore(doc: Document) {
  if (doc.getElementById('ash-lore-dialog')) return;
  const style = doc.createElement('style');
  style.textContent = `
    .ash-home-signature .ash-lore-tools {display:flex;gap:4px;margin-top:3px;pointer-events:auto;width:max-content;transform:rotate(1.5deg)}
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
  const title = dialog.querySelector('h2')!;
  const article = dialog.querySelector('article')!;
  dialog.querySelector('button')!.onclick = () => dialog.close();
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
      title.textContent = page.label;
      article.innerHTML = page.body;
      dialog.showModal();
      dialog.scrollTop = 0;
    };
    controls.append(button);
  });
  const attach = () => {
    const signature = doc.querySelector('.cinematic-entry .ash-home-signature');
    if (signature && controls.parentElement !== signature) signature.append(controls);
    if (!signature && dialog.open) dialog.close();
  };
  attach();
  const observer = new MutationObserver(attach);
  observer.observe(doc.getElementById('app') || doc.body, { childList:true, subtree:true });
  doc.defaultView?.addEventListener('pagehide', () => observer.disconnect(), { once:true });
}

const MAX_STATE_CHARS = 700_000;
const MAX_UPLOAD = 4 * 1024 * 1024;

export default function AshlinePage() {
  const { user, ready, mock } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [music, setMusic] = useState<MusicList>({ tracks: [], index: 0 });
  const syncMusic = (payload: Record<string, unknown> | null) => {
    const next = musicFromWorld(payload);
    setMusic(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  };
  const resetProgress = useRef<(() => Promise<void>) | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const frameReady = useRef(false);
  const slot = useRef<Slot | null>(null);
  const rev = useRef(0);
  const latest = useRef<World | null>(null);
  const writeInProgress = useRef(false);
  const [status, setStatus] = useState('ASHLINE 접속을 확인하는 중');
  const [failed, setFailed] = useState<string | null>(null);
  const uid = user?.id;

  useEffect(() => {
    if (!ready) return;
    if (!uid || mock || !isServerMode()) {
      setStatus('O.HOME 회원 로그인 후 입장할 수 있어.');
      return;
    }
    const home = currentHomeId();
    const be = backend();
    const cfg = serverConfig();
    if (!home) {
      setStatus('O.HOME에서 ASHLINE 자관을 선택한 뒤 들어와 줘.');
      return;
    }
    if (!be || cfg?.kind !== 'firebase') {
      setFailed('ASHLINE은 O.HOME Firebase 연결이 필요해. 사이트 관리자에게 문의해 줘.');
      return;
    }

    armMsgSound();
    let previousPartnerEntries: Map<string, string> | undefined;
    let lastSoundRevision = -1;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const origin = window.location.origin;
    const db = cfg.databaseId && cfg.databaseId !== '(default)' ? getFirestore(getApp(), cfg.databaseId) : getFirestore(getApp());
    const worldRef = doc(db, 'homes', home, 'ashline_state', 'chapter01');
    let resetPending = false;
    resetProgress.current = async () => {
      const player = slot.current;
      if (!player || !latest.current || resetPending) return;
      if (!window.confirm('이 자관의 애쉬라인을 처음부터 시작할까?\n\n두 생존자의 시설·소지품·탐사·무전과 프로필·역극·갤러리·메모·음악 목록까지 모두 초기화돼. 두 계정의 생존자 자리는 유지돼. 되돌릴 수 없어.')) return;
      resetPending = true;
      setResetting(true);
      try {
        await runTransaction(db, async tx => {
          const snap = await tx.get(worldRef);
          const world = snap.data() as World | undefined;
          if (!world || world.slots[player] !== uid) throw new Error('현재 생존자 계정으로 다시 접속해 줘.');
          tx.update(worldRef, { payload: null, revision: world.revision + 1, updatedAt: Date.now() });
        });
        if (!disposed) window.location.reload();
      } catch (error) {
        if (!disposed) {
          resetPending = false;
          setResetting(false);
          window.alert('초기화하지 못했어. ' + (error instanceof Error ? error.message : '연결을 확인해 줘.'));
        }
      }
    };
    const send = (payload: Record<string, unknown>) => {
      frame.current?.contentWindow?.postMessage(payload, origin);
    };
    const pushInitial = () => {
      const s = slot.current;
      const w = latest.current;
      if (!frameReady.current || !s || !w) return;
      rev.current = w.revision;
      syncMusic(w.payload);
      if (frame.current) frame.current.dataset.initialized = 'yes';
      send({ type: 'ASHLINE_INIT', slot: s, revision: w.revision, payload: w.payload });
    };

    const handleMessage = async (event: MessageEvent<IframeMsg>) => {
      if (disposed || event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ASHLINE_READY') {
        frameReady.current = true;
        pushInitial();
        return;
      }
      if (!slot.current || resetPending) return;
      if (msg.type === 'ASHLINE_UPLOAD') {
        const requestId = msg.requestId;
        if (!requestId) return;
        try {
          const format = msg.blob?.type;
          const extension: Record<string, string> = {
            'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
          };
          if (!(msg.blob instanceof Blob) || !format || !extension[format] || !msg.blob.size || msg.blob.size > MAX_UPLOAD) {
            throw new Error('PNG·JPG·WEBP·GIF 이미지만 4MB 이하로 올릴 수 있어.');
          }
          const url = await be.uploadFile(msg.blob, extension[format]);
          if (!disposed) send({ type: 'ASHLINE_UPLOAD_RESULT', requestId, url });
        } catch (err) {
          if (!disposed) send({ type: 'ASHLINE_UPLOAD_RESULT', requestId, error: err instanceof Error ? err.message : '업로드 실패' });
        }
        return;
      }
      if (msg.type !== 'ASHLINE_WRITE' || !msg.payload || writeInProgress.current) return;
      syncMusic(msg.payload);
      // Firestore counts UTF-8 bytes, not JavaScript string characters.
      // Keep a conservative margin for document keys, metadata and future schema additions.
      const payloadBytes = new TextEncoder().encode(JSON.stringify(msg.payload)).byteLength;
      if (payloadBytes > MAX_STATE_CHARS) {
        setFailed('기록 용량이 한도에 도달했어. 관리자에게 아카이브 분리를 요청해 줘.');
        return;
      }
      writeInProgress.current = true;
      try {
        const app = getApp();
        const db = (cfg.databaseId && cfg.databaseId !== '(default)' ? getFirestore(app, cfg.databaseId) : getFirestore(app));
        const ref = doc(db, 'homes', home, 'ashline_state', 'chapter01');
        const nextRevision = await runTransaction(db, async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error('연결 정보가 없어. 새로고침해 줘.');
          const old = snap.data() as World;
          if (old.slots[slot.current!] !== uid) throw new Error('캐릭터 소유 계정이 일치하지 않아.');
          if (old.revision !== Number(msg.expectedRevision)) throw new Error('REVISION_CONFLICT');
          tx.update(ref, { payload: msg.payload, revision: old.revision + 1, updatedAt: Date.now() });
          return old.revision + 1;
        });
        rev.current = nextRevision;
        if (!disposed) send({ type: 'ASHLINE_SAVED', revision: nextRevision });
      } catch (err) {
        try {
          const cfgDb = cfg.databaseId && cfg.databaseId !== '(default)' ? cfg.databaseId : undefined;
          const db = (cfgDb ? getFirestore(getApp(), cfgDb) : getFirestore(getApp()));
          const snap = await getDoc(doc(db, 'homes', home, 'ashline_state', 'chapter01'));
          if (snap.exists() && !disposed) {
            const next = snap.data() as World;
            rev.current = next.revision;
            send({ type: 'ASHLINE_REJECTED', revision: next.revision, payload: next.payload });
          }
        } catch { /* Firestore connection status is handled by onSnapshot. */ }
        if (err instanceof Error && err.message !== 'REVISION_CONFLICT') setFailed(err.message);
      } finally {
        writeInProgress.current = false;
      }
    };
    window.addEventListener('message', handleMessage);

    void (async () => {
      try {
        const app = getApp();
        const db = (cfg.databaseId && cfg.databaseId !== '(default)' ? getFirestore(app, cfg.databaseId) : getFirestore(app));
        const ref = doc(db, 'homes', home, 'ashline_state', 'chapter01');
        // The first two distinct O.HOME members occupy A and B; no client-side account toggle.
        const joined = await runTransaction(db, async tx => {
          const snap = await tx.get(ref);
          if (!snap.exists()) {
            tx.set(ref, { slots: { A: uid, B: null }, revision: 0, payload: null, updatedAt: Date.now() });
            return 'A' as Slot;
          }
          const w = snap.data() as World;
          if (w.slots.A === uid) return 'A' as Slot;
          if (w.slots.B === uid) return 'B' as Slot;
          if (!w.slots.B) {
            tx.update(ref, { 'slots.B': uid });
            return 'B' as Slot;
          }
          throw new Error('등록 가능한 생존자 자리가 없어.');
        });
        if (disposed) return;
        slot.current = joined;
        setStatus('ASHLINE 접속 완료');
        unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
          if (!snap.exists() || disposed) return;
          const world = snap.data() as World;
          if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites && world.revision > lastSoundRevision) {
            const entries = partnerRoleplayEntries(world.payload, joined);
            if (previousPartnerEntries) {
              for (const [key, value] of entries) {
                if (previousPartnerEntries.get(key) !== value) {
                  playMsgTone();
                  break;
                }
              }
            }
            previousPartnerEntries = entries;
            lastSoundRevision = world.revision;
          }
          latest.current = world;
          syncMusic(world.payload);
          if (resetPending) return;
          if (frame.current?.dataset.initialized && world.payload === null && world.revision > rev.current && !snap.metadata.hasPendingWrites) {
            window.location.reload();
            return;
          }
          if (!frameReady.current) return;
          // Always initialize the document before delivering incremental updates.
          if (!frame.current?.dataset.initialized) {
            frame.current?.setAttribute('data-initialized', 'yes');
            pushInitial();
            return;
          }
          if (world.revision > rev.current && !writeInProgress.current) {
            rev.current = world.revision;
            send({ type: 'ASHLINE_REMOTE', revision: world.revision, payload: world.payload });
          }
        }, err => { if (!disposed) setFailed('공유 기록에 연결하지 못했어. Firebase 규칙을 확인해 줘. ' + err.message); });
      } catch (err) {
        if (!disposed) setFailed(err instanceof Error ? err.message : 'ASHLINE에 연결하지 못했어.');
      }
    })();

    return () => {
      disposed = true;
      resetProgress.current = null;
      unsubscribe?.();
      window.removeEventListener('message', handleMessage);
    };
  }, [uid, ready, mock]);

  if (!ready || !uid || mock || !isServerMode() || !currentHomeId()) {
    return <div style={{ padding: '10vh 24px', color: '#dce4e9', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'serif', fontWeight: 400, letterSpacing: '.18em' }}>ASHLINE</h2>
      <p>{status}</p>
      <a href={uid ? '/' : '/login'} style={{ color: '#dce4e9' }}>O.HOME으로 돌아가기</a>
    </div>;
  }
  if (failed) {
    return <div style={{ padding: '10vh 24px', color: '#f0d6d6', textAlign: 'center' }} role="alert">
      <h2>ASHLINE 접속 오류</h2><p>{failed}</p>
      <a href="/" style={{ color: '#e9edf1' }}>O.HOME으로 돌아가기</a>
    </div>;
  }
  return <section style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', background: '#090e15', color: '#d4dce6' }}>
    <AshlineMusic tracks={music.tracks} initialIndex={music.index} footerMode />
    <iframe
      ref={frame}
      src="/ashline/index.html"
      title="ASHLINE - 끝에서 시작한 기록"
      onLoad={() => {
        const doc = frame.current?.contentDocument;
        if (!doc) return;
        installHomeLore(doc);
        doc.addEventListener('click', unlockMsgSound, true);
        doc.addEventListener('keydown', unlockMsgSound, true);
        // Installed within the iframe so the game can freely re-render its cards.
        // Suppress the original Korean handwritten label at the CSS level.
        if (!doc.getElementById('ohome-ashline-card-fix')) {
          const style = doc.createElement('style');
          style.id = 'ohome-ashline-card-fix';
          style.textContent = `
            .sidebar {overflow-y:auto !important;min-height:0 !important;overscroll-behavior:contain;scrollbar-width:thin}
            /* Use the game's own footer for controls. Playback is still handled
               by the persistent parent YouTube API player. */
            #bgmMount {display:none!important}
            .footer .itemfoot:has(> .bgm-block) {display:flex!important;min-width:0!important;padding:5px 10px!important}
            .footer .bgm-block {display:flex!important;align-items:center;min-width:0!important;gap:5px!important}
            .footer .bgm-block .bgm-button {
              border:1px solid transparent!important;text-decoration:none!important;
              display:inline-flex!important;align-items:center;justify-content:center;
              border-radius:5px;min-width:30px;height:32px;padding:4px 6px!important;
              font:12px Consolas,monospace!important;color:#c5e4de!important;
              background:transparent!important;cursor:pointer
            }
            .footer .bgm-block .bgm-button:hover,.footer .bgm-block .bgm-button:focus-visible {
              border-color:#617d88!important;background:#213946!important
            }
            .footer .bgm-block .bgm-title {
              display:block!important;min-width:0!important;max-width:170px!important;
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;
              font:11px Consolas,monospace!important
            }
            @media(max-width:780px) {
              :root {--b:94px!important}
              .footer {height:94px!important;flex-wrap:wrap!important;align-content:stretch!important}
              .footer .itemfoot:not(.mob-hide):not(:has(> .bgm-block)) {
                height:42px!important;padding:4px 8px!important
              }
              .footer .itemfoot.end {order:2!important;margin-left:auto!important;border:0!important}
              .footer .itemfoot:has(> .bgm-block) {
                order:3!important;width:100%!important;flex:0 0 100%!important;
                height:52px!important;padding:4px 10px!important;
                border-top:1px solid #344d57!important;border-right:0!important
              }
              .footer .bgm-block {width:100%!important;gap:8px!important}
              .footer .bgm-block .bgm-title {
                flex:1!important;max-width:none!important;justify-content:flex-start!important
              }
              .footer .bgm-block .bgm-button {height:34px!important;min-width:34px!important}
            }
            @media(max-width:390px) {
              .footer .itemfoot:not(.mob-hide):not(:has(> .bgm-block)) {padding:4px 5px!important}
              .footer .itemfoot.end #clock {display:none!important}
              .footer .bgm-block {gap:5px!important}
              .footer .bgm-block .bgm-button {min-width:32px!important}
            }
            .survivor-tile .tile-name-vertical {
              top:auto !important;bottom:15% !important;
              left:auto !important;right:0 !important;
              width:42px !important;height:auto !important;max-height:none !important;
              writing-mode:vertical-rl !important;
              text-orientation:sideways !important;
              transform:rotate(180deg) !important;
              transform-origin:center center !important;
              font-size:0 !important;overflow:visible !important;
              box-sizing:border-box !important;white-space:nowrap !important;
            }
            .survivor-tile .tile-name-vertical::after {
              content:attr(data-roman-name);
              font:italic 36px 'Segoe Print','Brush Script MT','Apple Chancery',cursive;
              color:#fff;opacity:.8;letter-spacing:.04em;text-shadow:0 1px 16px #050b12;
            }
            @media(max-width:700px) {.survivor-tile .tile-name-vertical::after {font-size:24px}}
            /* ASHLINE's own roleplay screen: collapse its actual room list. */
            .role-layout > section.panel.ash-rp-list-collapsed > .panel-body{display:none!important}
            .role-layout > section.panel.ash-rp-list-collapsed{align-self:start!important}
            .role-layout > section.panel > .panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
            .role-layout > section.panel .ash-rp-list-toggle{
              margin-left:auto;flex-shrink:0;border:1px solid #46616d;border-radius:6px;
              background:#142835;color:#cbdde3;padding:7px 11px;font:12px inherit;
              cursor:pointer;white-space:nowrap
            }
            .role-layout > section.panel .ash-rp-list-toggle:hover{background:#1c3945}
            /* The legacy YouTube dock is disabled; the footer controls are visible. */
            #bgmMount {display:none!important}
            @media(min-width:900px){
              .role-layout:has(> section.ash-rp-list-collapsed){grid-template-columns:minmax(185px,210px) minmax(0,1fr)!important}
            }
          `;
          doc.head.appendChild(style);
        }
        // Patch the embedded chapter's goal presentation using the live shared
        // game state. This does not alter saved data or the per-player mask gate.
        if (!doc.getElementById('ohome-ashline-two-mask-goal')) {
          const script = doc.createElement('script');
          script.id = 'ohome-ashline-two-mask-goal';
          script.textContent = `
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
          `;
          doc.body.appendChild(script);
        }
        // The ASHLINE HTML game recreates its own room-list DOM on each render.
        // Keep the collapse state outside that DOM so it survives every message.
        let rpRoomsCollapsed = true;
        const updateRpList = () => {
          const list = doc.querySelector<HTMLElement>('.role-layout');
          const panel = list?.querySelector<HTMLElement>(':scope > section.panel:first-child');
          const header = panel?.querySelector<HTMLElement>(':scope > .panel-head');
          const body = panel?.querySelector<HTMLElement>(':scope > .panel-body');
          if (!panel || !header || !body) return;
          if (panel.classList.contains('ash-rp-list-collapsed') !== rpRoomsCollapsed)
            panel.classList.toggle('ash-rp-list-collapsed', rpRoomsCollapsed);
          if (!body.id) body.id = 'ashline-rp-rooms-body';
          let button = header.querySelector<HTMLButtonElement>('.ash-rp-list-toggle');
          if (!button) {
            button = doc.createElement('button');
            button.type = 'button';
            button.className = 'ash-rp-list-toggle';
            button.setAttribute('aria-controls', 'ashline-rp-rooms-body');
            button.addEventListener('click', (e) => {
              e.preventDefault();
              rpRoomsCollapsed = !rpRoomsCollapsed;
              updateRpList();
            });
            header.appendChild(button);
          }
          const title = rpRoomsCollapsed ? '목록 펼치기 ▾' : '목록 접기 ▴';
          if (button.textContent !== title) button.textContent = title;
          button.setAttribute('aria-expanded', String(!rpRoomsCollapsed));
        };
        const rpListObserver = new MutationObserver(updateRpList);
        rpListObserver.observe(doc.body, { childList: true, subtree: true });
        updateRpList();

        // Keep the RP list's own collapse behavior; music click handling follows below.
        doc.addEventListener('click', event => {
          const actionNode = (event.target as Element | null)?.closest?.<HTMLElement>('[data-action]');
          const action = actionNode?.dataset.action;
          if (action === 'newRoom' || action === 'openRoom') rpRoomsCollapsed = true;
        }, true);
        frame.current?.addEventListener('load', () => rpListObserver.disconnect(), { once: true });
        // Pass the embedded game's music buttons to the stable O.HOME-style player.
        const passMusicClick = (event: MouseEvent) => {
          const element = (event.target as Element | null)?.closest?.<HTMLElement>('[data-action]');
          if (!element) return;
          const mapped: Record<string, string> = {
            bgmPlay: 'toggle', bgmPrev: 'prev', bgmNext: 'next',
            bgmSelect: 'select', bgmDock: 'open'
          };
          const action = element.dataset.action;
          if (!action || !mapped[action]) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          window.dispatchEvent(new CustomEvent('ashline-bgm-control', {
            detail: { action: mapped[action], index: Number(element.dataset.id) }
          }));
        };
        doc.addEventListener('click', passMusicClick, true);
        const removeLegacyAudio = () => {
          const dock = doc.getElementById('bgmMount');
          if (dock && dock.childElementCount) {
            dock.replaceChildren();
            dock.dataset.src = '';
          }
        };
        // The embedded game re-renders its footer. Reflect the actual parent
        // player state after each render so play/pause never shows a stale icon.
        const footerBgm = { playing: false, title: '' };
        const syncFooterBgm = () => {
          const play = doc.querySelector<HTMLButtonElement>('.footer .bgm-block [data-action="bgmPlay"]');
          if (play) {
            const icon = footerBgm.playing ? '❚❚' : '▶';
            if (play.textContent !== icon) play.textContent = icon;
            play.setAttribute('aria-label', footerBgm.playing ? '음악 일시정지' : '음악 재생');
          }
          const title = doc.querySelector<HTMLButtonElement>('.footer .bgm-block [data-action="bgmDock"]');
          if (title && footerBgm.title) {
            const label = '♫ ' + footerBgm.title;
            if (title.textContent !== label) title.textContent = label;
            title.title = footerBgm.title + ' · 목록 및 볼륨';
          }
        };
        const onBgmStatus = (event: Event) => {
          const status = (event as CustomEvent<{ playing?: boolean; title?: string }>).detail;
          if (!status) return;
          footerBgm.playing = !!status.playing;
          footerBgm.title = typeof status.title === 'string' ? status.title : '';
          syncFooterBgm();
        };
        window.addEventListener('ashline-bgm-status', onBgmStatus);
        const bgmObserver = new MutationObserver(() => {
          removeLegacyAudio();
          syncFooterBgm();
        });
        bgmObserver.observe(doc.body, { childList: true, subtree: true });
        removeLegacyAudio();
        syncFooterBgm();
        frame.current?.addEventListener('load', () => {
          doc.removeEventListener('click', passMusicClick, true);
          window.removeEventListener('ashline-bgm-status', onBgmStatus);
          bgmObserver.disconnect();
        }, { once: true });
        const setRomanNames = () => {
          doc.querySelectorAll<HTMLElement>('.survivor-tile').forEach(card => {
            const label = card.querySelector<HTMLElement>('.tile-name-vertical');
            if (!label) return;
            const slot = card.getAttribute('data-id') || 'A';
            const footerRoman = card.querySelector('.tile-footer small')?.textContent?.trim() || '';
            const roman = footerRoman && footerRoman !== 'UNREGISTERED SURVIVOR' && !/[가-힣]/.test(footerRoman)
              ? footerRoman : `SURVIVOR ${slot}`;
            if (label.dataset.romanName !== roman) label.dataset.romanName = roman;
          });
        };
        setRomanNames();
        const observer = new MutationObserver(setRomanNames);
        observer.observe(doc.body, {childList:true,subtree:true,characterData:true});
        frame.current?.addEventListener('load', () => observer.disconnect(), {once:true});
      }}
      style={{ display: 'block', width: '100%', height: '100%', minHeight: 0, border: 0 }}
    />
    {/* ASHLINE's existing upper-right radio indicator is replaced by an account control.
        The iframe is same-origin, but the account actions stay in the authenticated O.HOME shell. */}
    <div style={{ position: 'absolute', zIndex: 20, top: 16, right: 27 }}>
      <button
        type="button"
        aria-label={`${user.nickname} 계정 메뉴`}
        aria-expanded={accountOpen}
        aria-haspopup="menu"
        title={`${user.nickname} · 자관 목록으로`}
        onClick={() => setAccountOpen(v => !v)}
        style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', border: '1px solid #47606d', borderRadius: '50%', background: '#0d1b24', color: '#b5d1d8', boxShadow: '0 0 0 4px #0d1b24', cursor: 'pointer' }}
      >
        <span aria-hidden style={{ display: 'block', width: 23, height: 23, borderRadius: '50%', border: '2px solid #b1cbd3', background: '#819da6', boxShadow: 'inset 0 0 0 3px #0d1b24' }} />
      </button>
      {accountOpen && <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 10px)', minWidth: 166, borderRadius: 7, background: '#14232f', border: '1px solid #435766', boxShadow: '0 12px 28px #000a', padding: 5, color: '#e0e9ef' }}>
        <div style={{ padding: '6px 10px 8px', color: '#8da5b2', fontSize: 11 }}>{user.nickname}</div>
        <button role="menuitem" type="button" onClick={() => user.role === 'admin' ? leaveHome() : chooseAnotherMemberHome(user.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px', color: '#e0e9ef', fontSize: 12 }}>자관 목록으로</button>
        <button role="menuitem" type="button" disabled={resetting || !slot.current} onClick={() => void resetProgress.current?.()} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px', color: '#ffc0b8', fontSize: 12 }}>{resetting ? '초기화 중…' : '진행상황 초기화'}</button>
      </div>}
    </div>
  </section>;
}
