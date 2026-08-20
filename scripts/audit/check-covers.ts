/**
 * 표지 썸네일 깨짐 전수 실측 감사 (읽기 전용).
 *
 * is_active = true 인 전 도서의 cover_url을 정적 검사(형식) → 네트워크 검사(HEAD)로
 * 분류하고 결과를 scripts/audit/out/cover-audit-YYYYMMDD.json 에 저장한다.
 *
 * DB는 SELECT만 수행한다. 쓰기 경로 없음.
 *
 * 실행:
 *   node --env-file=.env.local scripts/audit/check-covers.ts
 *   node --env-file=.env.local scripts/audit/check-covers.ts --static-only
 */

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONCURRENCY = 8
const REQUEST_DELAY_MS = 100
const TIMEOUT_MS = 10_000
const PAGE_SIZE = 1000

/** 연속 차단(429/403) 감지 임계치 — 초과 시 즉시 중단한다. */
const BLOCK_STREAK_LIMIT = 10

type Status = 'ok' | 'malformed' | 'broken' | 'error' | 'timeout' | 'network-fail'

type BookRow = {
  id: string
  source_platform: string
  title: string
  cover_url: string | null
}

type Result = BookRow & {
  status: Status
  http_status: number | null
  detail: string | null
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const staticOnly = process.argv.includes('--static-only')

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`환경변수 ${name}가 없습니다. --env-file=.env.local 로 실행하세요.`)
  return v
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 1차 정적 검사: http(s) 절대 URL이 아니면 malformed. */
function isMalformed(raw: string | null): boolean {
  if (!raw) return true
  const s = raw.trim()
  if (!/^https?:\/\//i.test(s)) return true
  try {
    const u = new URL(s)
    return !u.hostname || !u.hostname.includes('.')
  } catch {
    return true
  }
}

function classifyHttp(code: number): Status {
  if (code >= 200 && code < 300) return 'ok'
  if (code === 404) return 'broken'
  return 'error'
}

/** 전 도서를 페이지네이션으로 SELECT (읽기 전용). */
async function fetchActiveBooks(): Promise<BookRow[]> {
  const sb = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    { auth: { persistSession: false } },
  )

  const rows: BookRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('books')
      .select('id, source_platform, title, cover_url')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`books SELECT 실패: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as BookRow[]))
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

/** HEAD → (405/501 시) Range GET 1회 재시도. */
async function probe(
  url: string,
): Promise<{ status: Status; http: number | null; detail: string | null }> {
  const attempt = async (method: 'HEAD' | 'GET') => {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        signal: ac.signal,
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    let res = await attempt('HEAD')
    if (res.status === 405 || res.status === 501) {
      res = await attempt('GET')
    }
    return { status: classifyHttp(res.status), http: res.status, detail: null }
  } catch (e) {
    const err = e as Error
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return { status: 'timeout', http: null, detail: `timeout ${TIMEOUT_MS}ms` }
    }
    const cause = (err as Error & { cause?: Error }).cause
    return { status: 'network-fail', http: null, detail: cause?.message ?? err.message }
  }
}

type Summary = Record<string, Record<string, number>>

function summarize(results: Result[]): Summary {
  const table: Summary = {}
  for (const r of results) {
    const row = (table[r.source_platform] ??= {})
    row[r.status] = (row[r.status] ?? 0) + 1
    row.total = (row.total ?? 0) + 1
  }
  return table
}

function printSummary(table: Summary, statuses: Status[]) {
  const platforms = Object.keys(table).sort()
  const cols = ['total', ...statuses]
  const pad = (s: string, n: number) => s.padEnd(n)
  const w = Math.max(16, ...platforms.map((p) => p.length + 1))
  console.log('\n' + pad('platform', w) + cols.map((c) => c.padStart(14)).join(''))
  console.log('-'.repeat(w + cols.length * 14))
  const totals: Record<string, number> = {}
  for (const p of platforms) {
    const row = table[p]
    console.log(pad(p, w) + cols.map((c) => String(row[c] ?? 0).padStart(14)).join(''))
    for (const c of cols) totals[c] = (totals[c] ?? 0) + (row[c] ?? 0)
  }
  console.log('-'.repeat(w + cols.length * 14))
  console.log(pad('ALL', w) + cols.map((c) => String(totals[c] ?? 0).padStart(14)).join(''))
}

async function main() {
  console.log('books SELECT (is_active = true) ...')
  const books = await fetchActiveBooks()
  console.log(`대상 ${books.length}건`)

  const results: Result[] = []
  const queue: BookRow[] = []

  for (const b of books) {
    if (isMalformed(b.cover_url)) {
      results.push({ ...b, status: 'malformed', http_status: null, detail: 'URL 형식 아님' })
    } else {
      queue.push(b)
    }
  }
  console.log(`malformed ${results.length}건 / 네트워크 검사 대상 ${queue.length}건`)

  let aborted: string | null = null

  if (!staticOnly) {
    let cursor = 0
    let done = 0
    let blockStreak = 0

    const worker = async () => {
      while (true) {
        if (aborted) return
        const i = cursor++
        if (i >= queue.length) return
        const b = queue[i]

        await sleep(REQUEST_DELAY_MS)
        const { status, http, detail } = await probe(b.cover_url as string)
        results.push({ ...b, status, http_status: http, detail })

        // 연속 차단 감지: 429/403이 임계치 이상 연속되면 즉시 중단(재시도 강행 금지).
        if (http === 429 || http === 403) {
          blockStreak++
          if (blockStreak >= BLOCK_STREAK_LIMIT) {
            aborted = `429/403 ${blockStreak}건 연속 — CDN 차단 의심으로 중단 (마지막 URL: ${b.cover_url})`
            return
          }
        } else {
          blockStreak = 0
        }

        done++
        if (done % 100 === 0) console.log(`  ... ${done}/${queue.length}`)
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    if (aborted) console.error(`\n[중단] ${aborted}`)
  }

  const statuses: Status[] = ['ok', 'malformed', 'broken', 'error', 'timeout', 'network-fail']
  const summary = summarize(results)
  printSummary(summary, statuses)

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const outPath = join(scriptDir, 'out', `cover-audit-${stamp}.json`)
  mkdirSync(dirname(outPath), { recursive: true })

  const details = results
    .filter((r) => r.status !== 'ok')
    .sort(
      (a, b) =>
        a.source_platform.localeCompare(b.source_platform) || a.status.localeCompare(b.status),
    )

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        mode: staticOnly ? 'static-only' : 'full',
        aborted,
        params: { concurrency: CONCURRENCY, delay_ms: REQUEST_DELAY_MS, timeout_ms: TIMEOUT_MS },
        checked: results.length,
        active_total: books.length,
        summary,
        details,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`\n저장: ${outPath}`)
  console.log(`ok 이외 상세 ${details.length}건`)
}

await main()
