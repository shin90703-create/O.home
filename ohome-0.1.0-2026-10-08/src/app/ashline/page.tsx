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
  return <section style={{ background: '#090e15', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', color: '#d4dce6' }}>
    <iframe
      ref={frame}
      src="/ashline/index.html"
      title="ASHLINE - 끝에서 시작한 기록"
      style={{ display: 'block', width: '100%', flex: 1, minHeight: 0, border: 0 }}
    />
    <footer style={{ position: 'relative', zIndex: 10, flexShrink: 0, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '0 20px', background: '#111923', borderTop: '1px solid #35414d', fontSize: 12 }}>
      <span style={{ marginRight: 'auto', letterSpacing: '.12em', fontSize: 10, color: '#8799a9' }}>ASHLINE · O.HOME ACCOUNT</span>
      <div style={{ position: 'relative' }}>
        <button type="button" aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#e2e9f1', padding: '5px 8px' }}>
          <span aria-hidden style={{ width: 22, height: 22, borderRadius: '50%', background: user.avatarColor || '#536171', border: '1px solid #73808d' }} />
          <span>{user.nickname}</span><span style={{ fontSize: 10 }}>▴</span>
        </button>
        {accountOpen && <div role="menu" style={{ position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', minWidth: 156, background: '#192430', border: '1px solid #43515e', boxShadow: '0 9px 30px #0009', borderRadius: 8, padding: 5 }}>
          <button role="menuitem" onClick={leaveHome} style={{ width: '100%', padding: '9px 12px', textAlign: 'left' }}>자관 목록으로</button>
        </div>}
      </div>
    </footer>
  </section>;
}
