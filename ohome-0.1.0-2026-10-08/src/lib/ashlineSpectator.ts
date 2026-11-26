import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

type World = { revision: number; payload: Record<string, unknown> | null };
type Invite = { id: string; key: string };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};
const str = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const facilities: Record<string, string> = { bed:'마른 잠자리', lamp:'임시 조명', bench:'간이 작업대', stove:'취사 버너', radio:'고정 무전 장치', med:'간이 의료대', barricade:'방어 차단벽', filter:'간이 정수 장치' };

const rows = (value: unknown) => (Array.isArray(value) ? value : []).map(record);
const pick = (value: unknown, keys: string) => Object.fromEntries(keys.split(' ').map(k => [k, record(value)[k]])
  .filter(([,v]) => ['string','boolean','number'].includes(typeof v)));
const counts = (value: unknown) => Object.fromEntries(Object.entries(record(value))
  .filter(([k,v]) => /^[a-zA-Z0-9_-]+$/.test(k) && typeof v === 'number'));
const slots = (v: unknown) => (Array.isArray(v) ? v : []).filter(x => x === 'A' || x === 'B');
const strings = (v: unknown) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string');
function publicView(payload: World['payload']) {
  const g = payload ?? {};
  const bySlot = (source: unknown, project: (v: Record<string,unknown>)=>unknown) =>
    Object.fromEntries(['A','B'].map(id => [id,project(record(record(source)[id]))]));
  const base = record(g.base);
  const visibleMission = (session: Record<string,unknown>) => session.siteId ? {...pick(session,'siteId status stage leader kind enemyHp enemyLevel warehouse'),participants:slots(session.participants),loot:counts(session.loot),actions:pick(session.actions,'A B'),logs:[]} : null;
  const messages = (v: unknown) => rows(v).map(m=>pick(m,'id from text time edited kind'));
  return { schema:2, game:{
    users:bySlot(g.users,u=>({...pick(u,'name zone location hp sp wounds lastRest'),equipment:pick(u.equipment,'face weapon armor tool'),inv:counts(u.inv)})),
    profiles:bySlot(g.profiles,p=>({...pick(p,'name roman role gender age height quote bio image registered faceX faceY faceZoom'),keywords:strings(p.keywords)})),
    base:{...pick(base,'level'),facilities:Object.fromEntries(Object.entries(record(base.facilities)).filter(([k,v])=>Object.prototype.hasOwnProperty.call(facilities,k)&&!!v).map(([k])=>[k,true]))},
    story:pick(g.story,'chapter completed'),...pick(g,'generation refreshAt'),
    sites:rows(g.sites).map(s=>pick(s,'id done')),fogCycle:pick(g.fogCycle,'lastStart activeUntil nextStart'),
    session:visibleMission(record(g.session)), soloMissions:bySlot(g.soloMissions,visibleMission),
    roleplays:rows(g.roleplays).filter(r=>r.spectatorPublic===true).map(r=>({...pick(r,'id title creator status createdAt createdDate completedAt'),participants:slots(r.participants),messages:messages(r.messages)})),
    notes:rows(g.notes).filter(n=>n.spectatorPublic===true).map(n=>({...pick(n,'id author date color text'),comments:messages(n.comments)})),
    gallery:rows(g.gallery).map(g=>pick(g,'id title caption image author date')),
    bgm:{...pick(record(g.bgm),'index'),tracks:rows(record(g.bgm).tracks).map(t=>pick(t,'title kind ytid'))},
    messages:[],logs:[]
  }};
}

const hex = (bytes: Uint8Array) => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const valid = (v: unknown): v is Invite => {
  const o = record(v);
  return /^[a-f0-9]{32}$/.test(str(o.id)) && /^[a-f0-9]{64}$/.test(str(o.key));
};

export function spectatorPublisher(db: Firestore, home: string) {
  const config = doc(db, 'homes', home, 'settings', 'ashlineSpectatorV1');
  const storage = getStorage();
  const bucket = ref(storage).bucket;
  let invite: Invite | undefined, world: World | undefined, sent = '', stopped = false;
  let pending: Promise<void> | undefined;
  const folder = (id: string) => 'ohome/spectators/' + id + '/';
  const path = (id: string) => folder(id) + 'public.bin';
  let retired = '';
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
      if (retired !== link.id) {
        // Retire both previous-format copies, including the other player's offline copy.
        await Promise.all(['A','B'].map(lane => uploadBytes(ref(storage,folder(link.id)+lane+'.bin'),new Uint8Array(0),{cacheControl:'no-store'})));
        retired = link.id;
      }
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
