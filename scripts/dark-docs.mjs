import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// Read section anchors from rendered Markdown, excluding headings inside code examples.
function headings (markdown) {
  const result = []
  let fence = null
  let anchor = null
  for (const match of markdown.matchAll(/^.*$/gm)) {
    const line = match[0]
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    const explicit = line.match(/^<a id="([^"]+)"><\/a>$/)
    if (explicit) { anchor = explicit[1]; continue }
    const heading = line.match(/^(#{2,3}) (.+)$/)
    if (heading) {
      const title = heading[2]
      result.push({ offset: match.index, level: heading[1].length, title, anchor: anchor || title.toLowerCase().replace(/[^\w -]/g, '').replace(/ /g, '-') })
    }
    if (line.trim()) anchor = null
  }
  return result
}

// Build navigation and an export summary from TypeDoc output, without library-specific lists.
function addOverview (markdown, api) {
  const sections = headings(markdown)
  const cell = value => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
  const rows = (api.children || []).map(symbol => {
    const section = sections.find(section => section.title === symbol.name || section.title === `${symbol.name}()`)
    if (!section) throw new Error(`Missing public API heading: ${symbol.name}`)
    const group = api.groups?.find(group => group.children.includes(symbol.id))?.title || ''
    const comment = symbol.comment || symbol.signatures?.[0]?.comment
    const description = (comment?.summary || []).map(part => part.text).join('').split(/(?<=\.)\s+/)[0]
    return `| [${symbol.name}](#${section.anchor}) | ${cell(group)} | ${cell(description)} |`
  })
  const overview = ['## API at a glance', '', '| API | Kind | Description |', '| :--- | :--- | :--- |', ...rows].join('\n')
  if (!sections.length) throw new Error('Missing API documentation sections')
  const insertAt = sections[0].offset
  const body = markdown.slice(0, insertAt) + overview + '\n\n' + markdown.slice(insertAt)
  const toc = headings(body).map(section => `${'  '.repeat(section.level - 2)}- [${section.title}](#${section.anchor})`).join('\n')
  return body.slice(0, insertAt) + `## Contents\n\n${toc}\n\n` + body.slice(insertAt)
}

// Generate outside the source tree: TypeDoc cleans its output directory by default.
const check = process.argv.includes('--check')
for (const entry of readdirSync('src/client/dark', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const library = `src/client/dark/${entry.name}`
  const temporary = mkdtempSync(join(tmpdir(), 'dekart-dark-docs-'))
  try {
    execFileSync('node_modules/.bin/typedoc', [
      '--plugin', 'typedoc-plugin-markdown', '--tsconfig', 'src/client/dark/tsconfig.json',
      '--entryPoints', `${library}/index.ts`, '--out', temporary, '--name', entry.name,
      '--readme', 'none', '--entryFileName', 'README.md', '--outputFileStrategy', 'modules',
      '--disableSources', '--hideBreadcrumbs', '--hidePageHeader', '--flattenOutputFiles',
      '--parametersFormat', 'table', '--interfacePropertiesFormat', 'table',
      '--typeDeclarationFormat', 'table', '--useCodeBlocks',
      '--useHTMLAnchors', '--anchorPrefix', 'api-', '--json', join(temporary, 'api.json')
    ], { stdio: 'pipe' })
    const generated = addOverview(readFileSync(join(temporary, 'README.md'), 'utf8'),
      JSON.parse(readFileSync(join(temporary, 'api.json'), 'utf8'))).replace(/[ \t]+$/gm, '')
    const target = `${library}/README.md`
    if (check) {
      if (readFileSync(target, 'utf8') !== generated) throw new Error(`Stale dark docs: ${target}; run npm run dark:docs`)
    } else writeFileSync(target, generated)
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}
