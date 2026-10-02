import ts from 'typescript'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { resolve, relative, dirname, basename } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = realpathSync('src/client/dark')
const modules = realpathSync('node_modules')
const fail = (file, message) => { throw new Error(`${file}: ${message}`) }
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`])

// Resolution, not import spelling, closes re-export, dynamic-import and symlink escapes.
const resolved = execFileSync('node_modules/.bin/tsc', ['-p', root, '--listFilesOnly'], { encoding: 'utf8' })
for (const file of resolved.trim().split('\n')) {
  const actual = realpathSync(file)
  if ((!actual.startsWith(`${root}/`) && !actual.startsWith(`${modules}/`)) ||
    /[/\\]node_modules[/\\]dekart-proto[/\\]/.test(file)) fail(file, 'dependency leaves dark libraries')
}

const denied = new Set([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage',
  'indexedDB', 'console', 'setTimeout', 'setInterval'
])
const deniedMembers = new Set([
  'Date.now', 'Math.random', 'document.cookie', 'navigator.sendBeacon',
  'vi.mock', 'vi.spyOn', 'vi.stubGlobal', 'vi.useFakeTimers', 'vi.setSystemTime'
])

for (const file of walk(root).filter(file => /\.tsx?$/.test(file))) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const library = relative(root, file).split('/')[0]
  const test = /\.test\.tsx?$/.test(file)
  const visit = node => {
    if (ts.isIdentifier(node) && denied.has(node.text)) fail(file, `forbidden access: ${node.text}`)
    if (ts.isPropertyAccessExpression(node) && deniedMembers.has(node.getText(source))) fail(file, `forbidden access: ${node.getText(source)}`)
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'Date' && (node.arguments?.length ?? 0) === 0) fail(file, 'inject the clock')
    if (ts.isVariableStatement(node) && node.parent === source && (node.declarationList.flags & ts.NodeFlags.Const) === 0) fail(file, 'mutable module state')
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'type' && ts.isStringLiteral(node.initializer) && /^[A-Z_]+$/.test(node.initializer.text) && !node.initializer.text.startsWith(`${library}/`)) fail(file, 'action types need a library prefix')
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text
      if (name === 'react-redux' && basename(file) !== 'store.ts') fail(file, 'react-redux belongs in store.ts')
      if (name.startsWith('.')) {
        const target = resolve(dirname(file), name)
        const targetLibrary = relative(root, target).split('/')[0]
        if (targetLibrary !== library && target !== `${root}/${targetLibrary}/index`) fail(file, 'cross-library imports need the public entry')
        if (test && name !== './index' && !(targetLibrary !== library && target.endsWith('/index'))) fail(file, 'contract tests must use public entries')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

// Reviewed app glue must enter a library through index, including dynamic imports/re-exports.
for (const file of walk('src/client').filter(file => /\.[cm]?[jt]sx?$/.test(file) && !resolve(file).startsWith(`${root}/`))) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const visit = node => {
    if (ts.isStringLiteral(node) && /(?:^|\/)dark\//.test(node.text) && !/\/dark\/[^/]+\/index$/.test(node.text)) fail(file, 'app deep import into dark library')
    ts.forEachChild(node, visit)
  }
  visit(source)
}
