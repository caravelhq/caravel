#!/usr/bin/env node
/**
 * web_research.mjs — Token-efficient web fetch and search
 *
 * Commands:
 *   node web_research.mjs fetch <url> [--max-chars N]
 *   node web_research.mjs search <query> [--max-results N]
 *   node web_research.mjs multi <url1> <url2> ... [--max-chars N]
 *
 * Fetches web pages, strips HTML to clean text, truncates for token efficiency.
 * Uses DuckDuckGo for search (no API key required).
 */

const DEFAULTS = {
  maxChars: 15000,
  maxResults: 8,
  timeout: 15000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

// --- HTML to text conversion ---

function htmlToText(html) {
  // Remove script, style, nav, footer, header tags and their content
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Convert common elements to text equivalents
  text = text
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

  // Extract href from links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, linkText) => {
    const clean = linkText.replace(/<[^>]+>/g, '').trim()
    if (href.startsWith('http') && clean) return `${clean} (${href})`
    return clean
  })

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')

  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

// --- Fetch a URL ---

async function fetchUrl(url, maxChars) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULTS.userAgent, 'Accept': 'text/html,application/xhtml+xml,text/plain,application/json' },
      signal: controller.signal,
      redirect: 'follow'
    })
    clearTimeout(timer)

    if (!res.ok) {
      return { url, error: `HTTP ${res.status} ${res.statusText}` }
    }

    const contentType = res.headers.get('content-type') || ''
    const body = await res.text()

    let text
    if (contentType.includes('application/json')) {
      try {
        text = JSON.stringify(JSON.parse(body), null, 2)
      } catch {
        text = body
      }
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

// --- Search via DuckDuckGo ---

async function searchDDG(query, maxResults) {
  // Use DuckDuckGo HTML search (no API key needed)
  const encoded = encodeURIComponent(query)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encoded}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout)

  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': DEFAULTS.userAgent },
      signal: controller.signal,
      redirect: 'follow'
    })
    clearTimeout(timer)

    const html = await res.text()

    // Extract results from DDG HTML
    const results = []
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      let href = match[1]
      // DDG wraps URLs in a redirect — extract actual URL
      const udParam = href.match(/uddg=([^&]+)/)
      if (udParam) href = decodeURIComponent(udParam[1])

      const title = match[2].replace(/<[^>]+>/g, '').trim()
      results.push({ title, url: href, snippet: '' })
    }

    // Match snippets to results
    let i = 0
    while ((match = snippetRegex.exec(html)) !== null && i < results.length) {
      results[i].snippet = match[1].replace(/<[^>]+>/g, '').trim()
      i++
    }

    return results
  } catch (err) {
    clearTimeout(timer)
    return [{ error: err.message || String(err) }]
  }
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log(`Usage:
  node web_research.mjs fetch <url> [--max-chars N]
  node web_research.mjs search <query> [--max-results N]
  node web_research.mjs multi <url1> <url2> ... [--max-chars N]`)
    process.exit(0)
  }

  const command = args[0]
  let maxChars = DEFAULTS.maxChars
  let maxResults = DEFAULTS.maxResults

  // Parse flags
  const flagIdx = args.indexOf('--max-chars')
  if (flagIdx !== -1) maxChars = parseInt(args[flagIdx + 1]) || DEFAULTS.maxChars
  const resultFlagIdx = args.indexOf('--max-results')
  if (resultFlagIdx !== -1) maxResults = parseInt(args[resultFlagIdx + 1]) || DEFAULTS.maxResults

  // Get positional args (everything between command and first flag)
  const positional = []
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break
    positional.push(args[i])
  }

  switch (command) {
    case 'fetch': {
      if (!positional[0]) { console.error('Error: URL required'); process.exit(1) }
      const result = await fetchUrl(positional[0], maxChars)
      if (result.error) {
        console.error(`Error fetching ${result.url}: ${result.error}`)
        process.exit(1)
      }
      console.log(`--- ${result.url} (${result.chars} chars) ---\n`)
      console.log(result.text)
      break
    }

    case 'search': {
      const query = positional.join(' ')
      if (!query) { console.error('Error: search query required'); process.exit(1) }
      const results = await searchDDG(query, maxResults)
      if (results[0]?.error) {
        console.error(`Search error: ${results[0].error}`)
        process.exit(1)
      }
      console.log(`Search: "${query}" — ${results.length} results\n`)
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.title}`)
        console.log(`   ${r.url}`)
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

    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}

main()
