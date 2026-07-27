#!/usr/bin/env node
/**
 * web_research.mjs — Token-efficient web fetch and search
 *
 * Commands:
 *   node web_research.mjs fetch <url> [--max-chars N]
 *   node web_research.mjs search <query> [--max-results N] [--provider tavily|brave|scrape]
 *   node web_research.mjs multi <url1> <url2> ... [--max-chars N]
 *   node web_research.mjs usage
 *
 * Search providers (default order: tavily → brave → scrape):
 *   - tavily: Tavily API (api.tavily.com) — requires api_key
 *   - brave:  Brave Search API — requires api_key
 *   - scrape: Keyless fallback — DDG Lite → DDG HTML → Bing (zero config)
 *
 * Config: .claude/config.json "web-research" block (primary).
 * Env var fallback: TAVILY_API_KEY, BRAVE_API_KEY.
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULTS = {
  maxChars: 15000,
  maxResults: 8,
  timeout: 15000,
}

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
]

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

// --- Config ---

function loadConfig() {
  const configPath = join(process.cwd(), '.claude', 'config.json')
  let cfg = {}
  if (existsSync(configPath)) {
    try { cfg = JSON.parse(readFileSync(configPath, 'utf8')) } catch {}
  }
  const wr = cfg['web-research'] || {}
  return {
    providerOrder: wr.provider_order || ['tavily', 'brave', 'scrape'],
    tavily: { apiKey: wr.tavily?.api_key || process.env.TAVILY_API_KEY || '' },
    brave:  { apiKey: wr.brave?.api_key  || process.env.BRAVE_API_KEY  || '' },
    monthlyCaps: {
      tavily: wr.monthly_caps?.tavily ?? 1000,
      brave:  wr.monthly_caps?.brave  ?? 2000,
    },
  }
}

// --- Usage monitoring ---

const USAGE_LOG = join(process.cwd(), '.caravel', 'web-research-usage.jsonl')

function logUsage({ provider, status, result_count, latency_ms, query }) {
  try {
    const dir = join(process.cwd(), '.caravel')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(USAGE_LOG, JSON.stringify({
      ts: new Date().toISOString(), provider, status, result_count, latency_ms, query,
    }) + '\n')
  } catch {}
}

function readUsage() {
  if (!existsSync(USAGE_LOG)) return []
  try {
    return readFileSync(USAGE_LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
  } catch { return [] }
}

function currentYYYYMM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthlyCount(records, provider) {
  const prefix = currentYYYYMM()
  return records.filter(r => r.provider === provider && r.ts?.startsWith(prefix) && r.status !== 'skipped-cap').length
}

// --- HTML to text ---

function htmlToText(html) {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<th[^>]*>/gi, ' | ')
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, linkText) => {
    const clean = linkText.replace(/<[^>]+>/g, '').trim()
    if (href.startsWith('http') && clean) return `${clean} (${href})`
    return clean
  })
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/&\w+;/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// --- Fetch a URL ---

async function fetchUrl(url, maxChars) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html,application/xhtml+xml,text/plain,application/json' },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return { url, error: `HTTP ${res.status} ${res.statusText}` }
    const contentType = res.headers.get('content-type') || ''
    const body = await res.text()
    let text
    if (contentType.includes('application/json')) {
      try { text = JSON.stringify(JSON.parse(body), null, 2) } catch { text = body }
    } else if (contentType.includes('text/plain')) {
      text = body
    } else {
      text = htmlToText(body)
    }
    if (text.length > maxChars) {
      text = text.substring(0, maxChars) + `\n\n[... truncated at ${maxChars} chars, full page is ${body.length} chars]`
    }
    return { url, text, chars: text.length }
  } catch (err) {
    clearTimeout(timer)
    return { url, error: err.message || String(err) }
  }
}

// --- Search providers ---

async function searchTavily(query, maxResults, apiKey) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENTS[0] },
    body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults, search_depth: 'basic' }),
    signal: AbortSignal.timeout(DEFAULTS.timeout),
  })
  if (res.status === 429) throw Object.assign(new Error('rate-limited'), { code: 'RATELIMIT' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.detail) throw new Error(String(data.detail))
  const results = (data.results || []).map(r => ({ title: r.title || '', url: r.url || '', snippet: r.content || '' }))
  if (data.answer) results.unshift({ title: '[Answer]', url: '', snippet: data.answer })
  return results.slice(0, maxResults)
}

async function searchBrave(query, maxResults, apiKey) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`
  const res = await fetch(url, {
    headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json', 'User-Agent': USER_AGENTS[0] },
    signal: AbortSignal.timeout(DEFAULTS.timeout),
  })
  if (res.status === 429) throw Object.assign(new Error('rate-limited'), { code: 'RATELIMIT' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.web?.results || []).slice(0, maxResults).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }))
}

// DDG Lite (POST — lighter page, harder to block)
async function tryDDGLite(query, maxResults) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout)
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: { 'User-Agent': randomUA(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `q=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const results = []
    const linkRe = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi
    let m
    while ((m = linkRe.exec(html)) !== null && results.length < maxResults) {
      let href = m[1]
      const ud = href.match(/uddg=([^&]+)/)
      if (ud) href = decodeURIComponent(ud[1])
      results.push({ title: m[2].replace(/<[^>]+>/g, '').trim(), url: href, snippet: '' })
    }
    let i = 0
    while ((m = snippetRe.exec(html)) !== null && i < results.length) {
      results[i].snippet = m[1].replace(/<[^>]+>/g, '').trim()
      i++
    }
    return results.length > 0 ? results : null
  } catch {
    clearTimeout(timer)
    return null
  }
}

// DDG HTML (GET)
async function tryDDGHtml(query, maxResults) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': randomUA() },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const results = []
    const resultRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    let m
    while ((m = resultRe.exec(html)) !== null && results.length < maxResults) {
      let href = m[1]
      const ud = href.match(/uddg=([^&]+)/)
      if (ud) href = decodeURIComponent(ud[1])
      results.push({ title: m[2].replace(/<[^>]+>/g, '').trim(), url: href, snippet: '' })
    }
    let i = 0
    while ((m = snippetRe.exec(html)) !== null && i < results.length) {
      results[i].snippet = m[1].replace(/<[^>]+>/g, '').trim()
      i++
    }
    return results.length > 0 ? results : null
  } catch {
    clearTimeout(timer)
    return null
  }
}

// Bing HTML (GET — last-resort fallback)
async function tryBingHtml(query, maxResults) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout)
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
      headers: { 'User-Agent': randomUA(), 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const results = []
    const algoRe = /<li[^>]+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi
    let m
    while ((m = algoRe.exec(html)) !== null && results.length < maxResults) {
      const block = m[1]
      const linkM = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      const snipM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      if (linkM) {
        results.push({
          title: linkM[2].replace(/<[^>]+>/g, '').trim(),
          url: linkM[1],
          snippet: snipM ? snipM[1].replace(/<[^>]+>/g, '').trim() : '',
        })
      }
    }
    return results.length > 0 ? results : null
  } catch {
    clearTimeout(timer)
    return null
  }
}

async function searchScrape(query, maxResults) {
  const fns = [
    () => tryDDGLite(query, maxResults),
    () => tryDDGHtml(query, maxResults),
    () => tryBingHtml(query, maxResults),
  ]
  for (const fn of fns) {
    const results = await fn()
    if (results && results.length > 0) return results
  }
  throw new Error('all scrape endpoints returned empty results')
}

// --- Provider chain ---

const VALID_PROVIDERS = ['tavily', 'brave', 'scrape']

async function search(query, maxResults, forceProvider) {
  const config = loadConfig()
  const records = readUsage()
  const chain = forceProvider ? [forceProvider] : config.providerOrder

  let lastError = null
  for (const provider of chain) {
    const t0 = Date.now()

    // Soft cap guard (keyed providers only)
    if (provider !== 'scrape') {
      const cap = config.monthlyCaps[provider]
      if (cap != null && monthlyCount(records, provider) >= cap) {
        logUsage({ provider, status: 'skipped-cap', result_count: 0, latency_ms: 0, query })
        console.error(`[web-research] ${provider}: skipped (monthly cap ${cap} reached)`)
        if (forceProvider) throw new Error(`${provider}: monthly cap ${cap} reached`)
        continue
      }
    }

    // Skip unconfigured keyed providers (silently, unless forced)
    if (provider === 'tavily' && !config.tavily.apiKey) {
      if (forceProvider) throw new Error('tavily: no API key configured (set in .claude/config.json or TAVILY_API_KEY)')
      continue
    }
    if (provider === 'brave' && !config.brave.apiKey) {
      if (forceProvider) throw new Error('brave: no API key configured (set in .claude/config.json or BRAVE_API_KEY)')
      continue
    }

    try {
      let results
      if (provider === 'tavily') results = await searchTavily(query, maxResults, config.tavily.apiKey)
      else if (provider === 'brave') results = await searchBrave(query, maxResults, config.brave.apiKey)
      else results = await searchScrape(query, maxResults)

      const latency_ms = Date.now() - t0

      if (!results || results.length === 0) {
        logUsage({ provider, status: 'failover', result_count: 0, latency_ms, query })
        console.error(`[web-research] ${provider}: empty results, trying next`)
        if (forceProvider) return []
        continue
      }

      logUsage({ provider, status: 'ok', result_count: results.length, latency_ms, query })
      console.error(`[web-research] provider: ${provider} (${latency_ms}ms, ${results.length} results)`)
      return results
    } catch (err) {
      const latency_ms = Date.now() - t0
      logUsage({ provider, status: 'error', result_count: 0, latency_ms, query })
      console.error(`[web-research] ${provider} error: ${err.message}`)
      lastError = err
      if (forceProvider) throw err
    }
  }

  throw lastError || new Error('all providers failed or returned no results')
}

// --- usage subcommand ---

function printUsage() {
  const config = loadConfig()
  const records = readUsage()
  const month = currentYYYYMM()

  console.log(`Web Research usage — ${month}\n`)

  for (const p of ['tavily', 'brave']) {
    const count = monthlyCount(records, p)
    const cap = config.monthlyCaps[p]
    const pct = cap ? Math.round((count / cap) * 100) : 0
    const warn = pct >= 80 ? '  ⚠️  >= 80%' : ''
    console.log(`  ${p}: ${count} / ${cap} (${pct}%)${warn}`)
  }

  const scrapeCount = records.filter(r => r.provider === 'scrape' && r.ts?.startsWith(month)).length
  console.log(`  scrape: ${scrapeCount} (no cap)`)

  const total = records.filter(r => r.ts?.startsWith(month)).length
  console.log(`\n  Total this month: ${total}`)
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log(`Usage:
  node web_research.mjs fetch <url> [--max-chars N]
  node web_research.mjs search <query> [--max-results N] [--provider tavily|brave|scrape]
  node web_research.mjs multi <url1> <url2> ... [--max-chars N]
  node web_research.mjs usage`)
    process.exit(0)
  }

  const command = args[0]
  let maxChars = DEFAULTS.maxChars
  let maxResults = DEFAULTS.maxResults
  let forceProvider = null

  const flagIdx = args.indexOf('--max-chars')
  if (flagIdx !== -1) maxChars = parseInt(args[flagIdx + 1]) || DEFAULTS.maxChars
  const resultFlagIdx = args.indexOf('--max-results')
  if (resultFlagIdx !== -1) maxResults = parseInt(args[resultFlagIdx + 1]) || DEFAULTS.maxResults
  const providerFlagIdx = args.indexOf('--provider')
  if (providerFlagIdx !== -1) {
    forceProvider = args[providerFlagIdx + 1] || null
    if (forceProvider && !VALID_PROVIDERS.includes(forceProvider)) {
      console.error(`Error: unknown provider "${forceProvider}". Valid: ${VALID_PROVIDERS.join(', ')}`)
      process.exit(1)
    }
  }

  const positional = []
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break
    positional.push(args[i])
  }

  switch (command) {
    case 'fetch': {
      if (!positional[0]) { console.error('Error: URL required'); process.exit(1) }
      const result = await fetchUrl(positional[0], maxChars)
      if (result.error) { console.error(`Error fetching ${result.url}: ${result.error}`); process.exit(1) }
      console.log(`--- ${result.url} (${result.chars} chars) ---\n`)
      console.log(result.text)
      break
    }

    case 'search': {
      const query = positional.join(' ')
      if (!query) { console.error('Error: search query required'); process.exit(1) }
      let results
      try {
        results = await search(query, maxResults, forceProvider)
      } catch (err) {
        console.error(`Search error: ${err.message}`)
        process.exit(1)
      }
      if (results.length === 0) {
        console.log(`Search: "${query}" — 0 results`)
        break
      }
      console.log(`Search: "${query}" — ${results.length} results\n`)
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.title}`)
        if (r.url) console.log(`   ${r.url}`)
        if (r.snippet) console.log(`   ${r.snippet}`)
        console.log()
      })
      break
    }

    case 'multi': {
      if (positional.length === 0) { console.error('Error: URLs required'); process.exit(1) }
      const perPage = Math.floor(maxChars / positional.length)
      const results = await Promise.all(positional.map(url => fetchUrl(url, perPage)))
      for (const result of results) {
        if (result.error) {
          console.error(`\n--- ERROR: ${result.url} — ${result.error} ---\n`)
        } else {
          console.log(`\n--- ${result.url} (${result.chars} chars) ---\n`)
          console.log(result.text)
        }
      }
      break
    }

    case 'usage': {
      printUsage()
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}

main()
