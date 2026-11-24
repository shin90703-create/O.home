'use client';

/**
 * ASHLINE local BGM playback. The game owns the track list in its shared world;
 * playback/volume are strictly per browser. O.HOME's stable YouTube IFrame API
 * approach is used rather than recreating an autoplay iframe on every render.
 */
import React, { useEffect, useRef, useState } from 'react';

export type AshlineTrack = { title: string; ytid: string; kind: 'video' | 'list' };

interface Player {
  loadVideoById(id: string): void;
  loadPlaylist?: (options: { listType: 'playlist'; list: string; index: number }) => void;
  playVideo(): void;
  pauseVideo(): void;
  setVolume(v: number): void;
  destroy(): void;
}
type YTApi = {
  Player: new (holder: HTMLElement, config: unknown) => Player;
};
type YTWindow = Window & { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };
const VOLUME_KEY = 'ashline.bgm.volume.v1';

export function AshlineMusic({ tracks, initialIndex }: { tracks: AshlineTrack[]; initialIndex: number }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(false);
  const [volume, setVolume] = useState(60);
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const playedRef = useRef(false);
  const armedRef = useRef(false);
  const tracksRef = useRef(tracks);
  const indexRef = useRef(index);
  const volumeRef = useRef(volume);
  const nextRef = useRef<() => void>(() => {});
  tracksRef.current = tracks;
  indexRef.current = index;
  volumeRef.current = volume;

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      if (Number.isFinite(v) && v >= 0 && v <= 100 && localStorage.getItem(VOLUME_KEY) !== null) setVolume(v);
    } catch { /* storage may be disabled */ }
  }, []);
  const firstList = useRef(false);
  useEffect(() => {
    if (!tracks.length) {
      firstList.current = false;
      setIndex(0);
      setPlaying(false);
      playedRef.current = false;
      return;
    }
    if (!firstList.current) {
      firstList.current = true;
      const i = Math.max(0, Math.min(initialIndex, tracks.length - 1));
      indexRef.current = i;
      setIndex(i);
    } else if (indexRef.current >= tracks.length) {
      // If the active item was deleted, never keep playing a stale YouTube URL.
      player.current?.pauseVideo();
      playedRef.current = false;
      setPlaying(false);
      indexRef.current = 0;
      setIndex(0);
    }
  }, [tracks, initialIndex]);
  useEffect(() => { player.current?.setVolume(volume); }, [volume]);

  const startAt = (i: number) => {
    const ts = tracksRef.current;
    if (!ts.length) return;
    const target = (i + ts.length) % ts.length;
    const track = ts[target];
    setIndex(target);
    indexRef.current = target;
    if (!player.current || !readyRef.current) {
      armedRef.current = true;
      return;
    }
    try {
      if (track.kind === 'list') {
        if (!player.current.loadPlaylist) throw new Error('YouTube playlist control unavailable');
        player.current.loadPlaylist({ listType: 'playlist', list: track.ytid, index: 0 });
      } else player.current.loadVideoById(track.ytid);
      player.current.setVolume(volumeRef.current);
      player.current.playVideo();
      playedRef.current = true;
      setPlaying(true);
    } catch { setPlaying(false); }
  };
  const next = () => startAt(indexRef.current + 1);
  nextRef.current = next;

  useEffect(() => {
    if (!tracks.length) return;
    let cancelled = false;
    const ytwin = window as YTWindow;
    const create = () => {
      if (cancelled || !holder.current || player.current || !ytwin.YT?.Player) return;
      player.current = new ytwin.YT.Player(holder.current, {
        width: 0, height: 0,
        playerVars: { controls: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            if (cancelled) return;
            readyRef.current = true;
            setReady(true);
            player.current?.setVolume(volumeRef.current);
            if (armedRef.current) {
              armedRef.current = false;
              startAt(indexRef.current);
            }
          },
          onStateChange: (event: { data: number }) => {
            if (cancelled) return;
            if (event.data === 0) {
              // YouTube advances individual videos inside a playlist itself;
              // jumping here would skip the rest of the shared playlist.
              if (tracksRef.current[indexRef.current]?.kind !== 'list') nextRef.current();
              else setPlaying(false);
            }
            else if (event.data === 1) { playedRef.current = true; setPlaying(true); }
            else if (event.data === 2 || event.data === -1) setPlaying(false);
          },
          onError: () => setPlaying(false),
        },
      });
    };
    if (ytwin.YT?.Player) create();
    else {
      const previous = ytwin.onYouTubeIframeAPIReady;
      ytwin.onYouTubeIframeAPIReady = () => { previous?.(); create(); };
      if (!document.getElementById('yt-iframe-api')) {
        const script = document.createElement('script');
        script.id = 'yt-iframe-api';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    }
    return () => {
      cancelled = true;
      readyRef.current = false;
      setReady(false);
      player.current?.destroy();
      player.current = null;
    };
    // Do not reconstruct the audio engine when tracks change during gameplay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length > 0]);

  const toggle = () => {
    if (!tracksRef.current.length) return;
    if (playing) {
      player.current?.pauseVideo();
      setPlaying(false);
    } else if (!readyRef.current || !player.current) armedRef.current = true;
    else if (!playedRef.current) startAt(indexRef.current);
    else { player.current.setVolume(volumeRef.current); player.current.playVideo(); setPlaying(true); }
  };
  // Commands from the embedded ASHLINE settings screen. The game continues
  // to edit/save its own playlist; only playback is delegated to this player.
  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; index?: number }>).detail;
      if (!detail) return;
      if (detail.action === 'toggle') toggle();
      else if (detail.action === 'next') next();
      else if (detail.action === 'prev') startAt(indexRef.current - 1);
      else if (detail.action === 'select' && Number.isInteger(detail.index)) startAt(detail.index!);
      else if (detail.action === 'open') setOpen(o => !o);
    };
    window.addEventListener('ashline-bgm-control', onControl);
    return () => window.removeEventListener('ashline-bgm-control', onControl);
  });

  const changeVolume = (v: number) => {
    const safe = Math.max(0, Math.min(100, v));
    setVolume(safe);
    volumeRef.current = safe;
    player.current?.setVolume(safe);
    try { localStorage.setItem(VOLUME_KEY, String(safe)); } catch {}
  };
  // The same-origin ASHLINE iframe sends native click gestures to this
  // player synchronously, rather than asynchronously through React state.
  // This matters for browsers that block YouTube playback without a gesture.
  const onCommandRef = useRef<(detail: { action?: string; index?: number }) => void>(() => {});
  onCommandRef.current = detail => {
    if (detail.action === 'bgmPlay' || detail.action === 'bgmDock') toggle();
    else if (detail.action === 'bgmNext') startAt(indexRef.current + 1);
    else if (detail.action === 'bgmPrev') startAt(indexRef.current - 1);
    else if (detail.action === 'bgmSelect' && Number.isInteger(detail.index))
      startAt(detail.index!);
  };
  useEffect(() => {
    const receive = (ev: Event) => {
      const detail = (ev as CustomEvent<{ action?: string; index?: number }>).detail;
      if (detail && typeof detail === 'object') onCommandRef.current(detail);
    };
    window.addEventListener('ashline-bgm-control', receive);
    return () => window.removeEventListener('ashline-bgm-control', receive);
  }, []);

  if (!tracks.length) return null;
  const track = tracks[index] ?? tracks[0];

  return (
    <div className={`bgm ${folded ? 'folded' : ''}`}
      style={{ bottom: 69, zIndex: 85 }}
      onClick={() => { if (folded) setFolded(false); }}>
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div ref={holder} />
      </div>
      <div className="disc" style={{ animationPlayState: playing ? 'running' : 'paused' }} />
      <div className="title">
        <div className="mq tt" title={track.title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
        <div className="mq">{ready ? 'ASHLINE · BGM' : '플레이어 연결 중'}</div>
      </div>
      <div className="ctrl">
        <button title="이전 곡" onClick={e => { e.stopPropagation(); startAt(indexRef.current - 1); }}>◂◂</button>
        <button title={playing ? '일시정지' : '재생'} onClick={e => { e.stopPropagation(); toggle(); }}>{playing ? '❚❚' : '▶'}</button>
        <button title="다음 곡" onClick={e => { e.stopPropagation(); next(); }}>▸▸</button>
        <button className="lst" title="곡 목록" onClick={e => { e.stopPropagation(); setOpen(v => !v); }}>☷</button>
      </div>
      <div className="vol" title={`볼륨 ${volume}%`}
        onPointerDown={e => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const v = (clientX: number) => changeVolume(Math.round(100 * (clientX - rect.left) / rect.width));
          v(e.clientX);
          const move = (ev: PointerEvent) => v(ev.clientX);
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}>
        <i style={{ width: `${volume}%` }} />
      </div>
      <button className="fold-btn" title="접기" onClick={e => { e.stopPropagation(); setOpen(false); setFolded(true); }}>»</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setOpen(false)} />
          <div className="bgm-list on">
            <div className="h">ASHLINE BGM LIST</div>
            <div className="tracks">
              {tracks.map((t, i) => (
                <div className={`it ${i === index ? 'on' : ''}`} key={t.kind + ':' + t.ytid + ':' + i}
                  onClick={e => { e.stopPropagation(); startAt(i); setOpen(false); }}>
                  <b>{t.title}</b><small>{t.kind === 'list' ? 'YouTube Playlist' : 'YouTube Video'}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
