import iconv from 'iconv-lite'
import prisma from '@/src/lib/prisma'

// roadrun.co.kr 2026 마라톤 일정 크롤링 + DB upsert
export async function crawlAndSync(): Promise<{ added: number; updated: number; message: string }> {
  const html = await fetchPage(
    'http://www.roadrun.co.kr/schedule/list.php',
    'euc-kr',
    'POST',
    { syear_key: '2026' },
  )

  const text = extractText(html)
  if (text.length < 50) throw new Error('본문 내용을 가져오지 못했습니다')

  const marathons = parseRoadRunSchedule(text)
  if (marathons.length === 0) throw new Error('파싱된 마라톤 데이터가 없습니다')

  let added = 0, updated = 0

  for (const m of marathons) {
    const existing = await prisma.marathon.findFirst({ where: { name: m.name } })
    if (existing) {
      await prisma.marathon.update({
        where: { id: existing.id },
        data: { date: m.date, location: m.location, city: m.city, categories: m.categories },
      })
      updated++
    } else {
      await prisma.marathon.create({ data: m })
      added++
    }
  }

  return { added, updated, message: `크롤링 완료: 신규 ${added}개, 업데이트 ${updated}개` }
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchPage(
  url: string,
  charset: string,
  method: 'GET' | 'POST',
  params: Record<string, string> = {},
): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  }

  let body: BodyInit | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(params).toString()
  }

  const resp = await fetch(url, { method, headers, body })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const buffer = await resp.arrayBuffer()
  return iconv.decode(Buffer.from(buffer), charset)
}

// ── HTML → plain text ──────────────────────────────────────────────────────

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
}

// ── Parser ──────────────────────────────────────────────────────────────────

const reDateLine     = /^\d{1,2}\/\d{1,2}$/
const reWeekday      = /^\([월화수목금토일]\)$/
const reCategoryLine = /풀|하프|full|half|\d+km|\d+k,|\d+k$|km,|,km/i

interface MarathonData {
  name: string
  date: string
  location: string
  city: string
  categories: string
  isActive: boolean
}

function parseRoadRunSchedule(text: string): MarathonData[] {
  const lines = text.split('\n')
  const results: MarathonData[] = []

  let startIdx = lines.findIndex(l => l.trim() === '날짜')
  if (startIdx < 0) startIdx = 0
  else startIdx++

  let i = startIdx
  while (i < lines.length) {
    const line = lines[i].trim()

    if (!reDateLine.test(line)) { i++; continue }

    const dateStr = line
    i++

    if (i < lines.length && reWeekday.test(lines[i].trim())) i++

    if (i >= lines.length) break
    const name = lines[i].trim()
    i++

    let categories = 'Full'
    if (i < lines.length && reCategoryLine.test(lines[i].trim())) {
      categories = normalizeCategories(lines[i].trim())
      i++
    }

    let location = ''
    if (i < lines.length) { location = lines[i].trim(); i++ }

    while (i < lines.length && !reDateLine.test(lines[i].trim())) i++

    if (!name) continue

    const date = parseDate(dateStr)
    if (!date) continue

    results.push({ name, date, location, city: extractCity(location), categories, isActive: true })
  }

  return results
}

function parseDate(s: string): string | null {
  const parts = s.split('/')
  if (parts.length !== 2) return null
  const m = parseInt(parts[0]), d = parseInt(parts[1])
  if (isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeCategories(s: string): string {
  const cats: string[] = []
  if (s.includes('5')) cats.push('5K')
  if (s.includes('10')) cats.push('10K')
  if (s.includes('하프') || s.includes('21')) cats.push('Half')
  if (s.includes('풀') || s.includes('42') || s.includes('마라톤')) cats.push('Full')
  return cats.length ? cats.join(',') : 'Full'
}

const CITY_RULES: [string, string][] = [
  ['서울', '서울특별시'], ['부산', '부산광역시'], ['대구', '대구광역시'],
  ['인천', '인천광역시'], ['광주광역', '광주광역시'], ['대전', '대전광역시'],
  ['울산', '울산광역시'], ['세종', '세종특별자치도'], ['제주', '제주특별자치도'],
  ['경기', '경기도'], ['강원', '강원특별자치도'],
  ['충청북도', '충청북도'], ['충북', '충청북도'],
  ['충청남도', '충청남도'], ['충남', '충청남도'],
  ['전라북도', '전라북도'], ['전북', '전라북도'],
  ['전라남도', '전라남도'], ['전남', '전라남도'],
  ['경상북도', '경상북도'], ['경북', '경상북도'],
  ['경상남도', '경상남도'], ['경남', '경상남도'],
  ['수원','경기도'],['고양','경기도'],['용인','경기도'],['성남','경기도'],['부천','경기도'],
  ['안산','경기도'],['안양','경기도'],['남양주','경기도'],['화성','경기도'],['평택','경기도'],
  ['의정부','경기도'],['시흥','경기도'],['파주','경기도'],['광명','경기도'],['김포','경기도'],
  ['군포','경기도'],['이천','경기도'],['양주','경기도'],['구리','경기도'],['하남','경기도'],
  ['춘천','강원특별자치도'],['원주','강원특별자치도'],['강릉','강원특별자치도'],
  ['동해','강원특별자치도'],['속초','강원특별자치도'],['평창','강원특별자치도'],
  ['청주','충청북도'],['충주','충청북도'],['천안','충청남도'],['아산','충청남도'],
  ['전주','전라북도'],['군산','전라북도'],['목포','전라남도'],['여수','전라남도'],['순천','전라남도'],
  ['포항','경상북도'],['경주','경상북도'],['안동','경상북도'],['구미','경상북도'],
  ['창원','경상남도'],['진주','경상남도'],['김해','경상남도'],['거제','경상남도'],
  ['서귀포','제주특별자치도'],
  ['광주','경기도'],
]

function extractCity(location: string): string {
  for (const [kw, city] of CITY_RULES) {
    if (location.includes(kw)) return city
  }
  return ''
}
