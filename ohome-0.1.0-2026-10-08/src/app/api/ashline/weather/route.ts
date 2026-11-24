export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

const source = 'https://www.weather.go.kr/w/weather/land/city-obs.do';
const clean = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').trim();

export async function GET() {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  try {
    const response = await fetch(source, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('KMA unavailable');
    const html = await response.text();
    const stamp = clean(html.slice(Math.max(0,html.indexOf('기상실황표')-100))).match(/기상실황표\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})/);
    if (!stamp) throw Error('Missing time');
    const [,year,month,day,hour,minute] = stamp.map(Number);
    const observedAt = Date.UTC(year, month-1, day, hour-9, minute);
    if (Date.now()-observedAt > 3*3600000 || observedAt > Date.now()+300000) throw Error('Stale observation');
    for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = Array.from(row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), m => clean(m[1]));
      if (cells[0] !== '대전' || !/^-?\d+(?:\.\d+)?$/.test(cells[5] ?? '')) continue;
      const temperature = Number(cells[5]);
      if (temperature < -60 || temperature > 60) throw Error('Invalid observation');
      const condition = cells[1] || '일기 미보고';
      const code = /뇌전|천둥/.test(condition) ? 95 : /눈|설/.test(condition) ? 71 : /소나기/.test(condition) ? 80 : /비|우박/.test(condition) ? 61 : /안개/.test(condition) ? 45 : /흐림/.test(condition) ? 3 : /구름많/.test(condition.replace(/\s/g,'')) ? 2 : /구름/.test(condition) ? 1 : /맑/.test(condition) ? 0 : -1;
      return Response.json({current:{temperature_2m:temperature,weather_code:code,condition,observedAt}}, {headers:{...headers,'Cache-Control':'public, s-maxage=300'}});
    }
    throw Error('Missing station');
  } catch {
    return Response.json({error:'기상청 대전 관측자료 수신 지연'}, {status:503,headers:{...headers,'Cache-Control':'no-store'}});
  }
}
