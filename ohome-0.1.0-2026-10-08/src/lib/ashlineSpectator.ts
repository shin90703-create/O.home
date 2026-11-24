import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

type World = { revision: number; payload: Record<string, unknown> | null };
type Slot = 'A' | 'B';
type Invite = { id: string; key: string };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};
const str = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const facilities: Record<string, string> = { bed:'마른 잠자리', lamp:'임시 조명', bench:'간이 작업대', stove:'취사 버너', radio:'고정 무전 장치', med:'간이 의료대', barricade:'방어 차단벽', filter:'간이 정수 장치' };

function publicView(payload: World['payload']) {
  const game = payload ?? {};
  const users = record(game.users), profiles = record(game.profiles);
  const name = (slot: unknown) => {
    const id = slot === 'A' || slot === 'B' ? slot : '';
    return str(record(profiles[id]).name) || str(record(users[id]).name) || ('생존자 ' + id);
  };
  const installed = record(record(game.base).facilities);
  const equipment = Object.keys(facilities).filter(k => installed[k]).map(k => facilities[k]);
  return {
    base: equipment.length >= 6 ? '지하 생존 거점' : equipment.length >= 3 ? '임시 은신처' : '배수로 구석',
    equipment,
    rooms: (Array.isArray(game.roleplays) ? game.roleplays : []).map(value => {
      const room = record(value);
      return { id: str(room.id), title: str(room.title, '역극'), messages:
        (Array.isArray(room.messages) ? room.messages : []).map(value => {
          const m = record(value);
          return { name:name(m.from), text:str(m.text), time:str(m.time) };
        }) };
    })
  };
}

const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const valid = (v: unknown): v is Invite => {
  const o = record(v);
  return /^[a-f0-9]{32}$/.test(str(o.id)) && /^[a-f0-9]{64}$/.test(str(o.key));
};

export function spectatorPublisher(db: Firestore, home: string, slot: Slot) {
  const config = doc(db, 'homes', home, 'settings', 'ashlineSpectatorV1');
  const storage = getStorage();
  const bucket = ref(storage).bucket;
  let invite: Invite | undefined, world: World | undefined, sent = '', stopped = false;
  let pending: Promise<void> | undefined;
  const path = (id: string) => 'ohome/spectators/' + id + '/' + slot + '.bin';
  async function sync() {
    while (!stopped && world && invite) {
      const current = world, link = invite;
      const data = JSON.stringify(publicView(current.payload));
      const signature = link.id + data;
      if (signature === sent) return;
      const key = await crypto.subtle.importKey('raw', Uint8Array.from(link.key.match(/../g)!, x => parseInt(x,16)), 'AES-GCM', false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = new TextEncoder().encode(JSON.stringify({ revision:current.revision, ...JSON.parse(data) }));
      const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,body);
      await uploadBytes(ref(storage,path(link.id)),new Blob([iv,cipher]),{contentType:'application/octet-stream',cacheControl:'no-store'});
      sent = signature;
    }
  }
  const flush = () => pending ??= sync().finally(() => { pending = undefined; });
  const kick = () => { void flush().catch(() => {}); };
  const stopConfig = onSnapshot(config, snap => {
    const data = snap.data();
    if (valid(data)) { invite = data; kick(); }
  }, () => {});
  const retry = window.setInterval(kick, 15000);
  return {
    update(next: World) { if (!world || next.revision >= world.revision) world = next; kick(); },
    async link() {
      if (!world) throw new Error('공유 기록을 불러오는 중이야. 잠시 뒤 다시 눌러 줘.');
      if (!invite) {
        invite = await runTransaction(db, async tx => {
          const existing = (await tx.get(config)).data();
          if (valid(existing)) return existing;
          const created = {id:hex(crypto.getRandomValues(new Uint8Array(16))),key:hex(crypto.getRandomValues(new Uint8Array(32)))};
          tx.set(config, created);
          return created;
        });
      }
      await flush();
      const probe = await fetch('https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(bucket) + '/o/' + encodeURIComponent(path(invite.id)) + '?alt=media', {cache:'no-store',credentials:'omit'});
      if (!probe.ok) throw new Error('관전 자료의 비회원 읽기 권한을 확인하지 못했어.');
      return location.origin + '/ashline/watch.html#' + new URLSearchParams({b:bucket,i:invite.id,k:invite.key});
    },
    stop() { stopped = true; stopConfig(); window.clearInterval(retry); }
  };
}
