const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// These sizes mirror the six uploaded CSVs on the affected Cloud report.
const files = [
  ['residential.csv', 2386534, 'Point'],
  ['camp.csv', 626670, 'Polygon'],
  ['state.csv', 87690, 'Polygon'],
  ['county.csv', 5418275, 'Polygon'],
  ['suburb.csv', 5845924, 'Polygon'],
  ['flood-zones.csv', 56508285, 'Polygon']
]

function geometryFor (type, index) {
  const longitude = -84 + (index % 100) / 1000
  const latitude = 32 + (Math.floor(index / 100) % 100) / 1000
  if (type === 'Point') {
    return { type, coordinates: [longitude, latitude] }
  }
  const ring = Array.from({ length: 65 }, (_, vertex) => {
    const angle = 2 * Math.PI * (vertex % 64) / 64
    return [longitude + Math.cos(angle) / 100, latitude + Math.sin(angle) / 100]
  })
  return { type, coordinates: [ring] }
}

function writeCsv (directory, name, targetBytes, type) {
  const fd = fs.openSync(path.join(directory, name), 'w')
  let bytes = fs.writeSync(fd, 'geometry,category\n')
  let index = 0
  try {
    while (bytes < targetBytes) {
      const geometry = JSON.stringify(geometryFor(type, index)).replaceAll('"', '""')
      bytes += fs.writeSync(fd, `"${geometry}",group-${index % 4}\n`)
      index++
    }
  } finally {
    fs.closeSync(fd)
  }
  return index
}

if (process.argv[2] === '--cleanup') {
  const directory = process.argv[3]
  if (!directory || path.dirname(directory) !== os.tmpdir() ||
    !path.basename(directory).startsWith('dekart-kepler-report-')) {
    throw new Error('Refusing to clean a path outside generated fixtures')
  }
  fs.rmSync(directory, { recursive: true, force: true })
  process.exit(0)
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dekart-kepler-report-'))
const rows = {}
for (const [name, bytes, type] of files) {
  rows[name] = writeCsv(directory, name, bytes, type)
}
fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(rows))
process.stdout.write(directory)
