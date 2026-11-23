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
import { currentHomeId, leaveHome } from '@/lib/home';
import { serverConfig } from '@/lib/serverConfig';

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

const MAX_STATE_CHARS = 700_000;
const MAX_UPLOAD = 4 * 1024 * 1024;

export default function AshlinePage() {
  const { user, ready, mock } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
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

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const origin = window.location.origin;
    const send = (payload: Record<string, unknown>) => {
      frame.current?.contentWindow?.postMessage(payload, origin);
    };
    const pushInitial = () => {
      const s = slot.current;
      const w = latest.current;
      if (!frameReady.current || !s || !w) return;
      rev.current = w.revision;
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
      if (!slot.current) return;
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
        unsubscribe = onSnapshot(ref, snap => {
          if (!snap.exists() || disposed) return;
          const world = snap.data() as World;
          latest.current = world;
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
    <iframe
      ref={frame}
      src="/ashline/index.html"
      title="ASHLINE - 끝에서 시작한 기록"
      onLoad={() => {
        const doc = frame.current?.contentDocument;
        if (!doc) return;
        // Installed within the iframe so the game can freely re-render its cards.
        // Suppress the original Korean handwritten label at the CSS level.
        if (!doc.getElementById('ohome-ashline-card-fix')) {
          const style = doc.createElement('style');
          style.id = 'ohome-ashline-card-fix';
          style.textContent = `
            .sidebar {overflow-y:auto !important;min-height:0 !important;overscroll-behavior:contain;scrollbar-width:thin}
            .survivor-tile .tile-name-vertical {
              top:auto !important;bottom:22% !important;
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
          `;
          doc.head.appendChild(style);
        }
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
        <button role="menuitem" type="button" onClick={leaveHome} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px', color: '#e0e9ef', fontSize: 12 }}>자관 목록으로</button>
      </div>}
    </div>
  </section>;
}
