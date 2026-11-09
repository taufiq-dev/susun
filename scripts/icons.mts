// Makes the app's icons from the logo's symbol (src/renderer/src/assets/susun-logo.svg):
// - build/icon.svg, build/icon.png and build/icon.icns: macOS's layout, an 824 px tile with a soft
//   shadow on a 1024 px canvas (electron-builder's mac and linux icons)
// - build/icon.ico: the tile alone, filling the square (Windows)
// - resources/icon.png: the window icon on Linux and the Dock icon in development
// Run `pnpm icons` after changing the logo (Node runs this TypeScript as it is). Needs rsvg-convert
// (librsvg) and macOS's iconutil.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LOGO = 'src/renderer/src/assets/susun-logo.svg'
const BACKGROUND = ['#FDFBF8', '#F3EEE8'] // top to bottom, around the brand's #FAF6F2

// The symbol's drawing, without its own <svg>, <title> and <desc>. It is 195 by 148.
const logo = readFileSync(LOGO, 'utf8')
const symbol = logo
  .slice(logo.indexOf('>', logo.indexOf('<svg')) + 1, logo.lastIndexOf('</svg>'))
  .replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>/g, '')
  .trim()

// The symbol is 512 wide, centred, then nudged right: its rows get shorter downwards, so most of
// its weight is left of its middle.
const scale = 512 / 195
const x = 512 - (195 * scale) / 2 + 24
const y = 512 - (148 * scale) / 2

function icon({ shadow }: { shadow: boolean }): string {
  const viewBox = shadow ? '0 0 1024 1024' : '100 100 824 824'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${viewBox}">
  <title>Susun</title>
  <defs>
    <linearGradient id="icon-tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BACKGROUND[0]}"/>
      <stop offset="1" stop-color="${BACKGROUND[1]}"/>
    </linearGradient>
    <filter id="icon-shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
      <feOffset dy="10"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#icon-tile)"${shadow ? ' filter="url(#icon-shadow)"' : ''}/>
  <rect x="101" y="101" width="822" height="822" rx="184" fill="none" stroke="#000" stroke-opacity="0.07" stroke-width="2"/>
  <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})">
    ${symbol.replace(/\n\s*/g, '\n    ')}
  </g>
</svg>
`
}

const tmp = mkdtempSync(join(tmpdir(), 'susun-icons-'))
const render = (svg: string, size: number, out: string): Buffer =>
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out, svg])

const mac = join(tmp, 'mac.svg')
const square = join(tmp, 'square.svg')
writeFileSync('build/icon.svg', icon({ shadow: true }))
writeFileSync(mac, icon({ shadow: true }))
writeFileSync(square, icon({ shadow: false }))

render(mac, 1024, 'build/icon.png')
render(mac, 512, 'resources/icon.png')

// The .icns: each size at 1x and 2x.
const iconset = join(tmp, 'icon.iconset')
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
  render(mac, size, join(iconset, `icon_${size}x${size}.png`))
  render(mac, size * 2, join(iconset, `icon_${size}x${size}@2x.png`))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'build/icon.icns'])

// The .ico: a PNG for each size, behind ICO's header and directory.
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map((size) => {
  const out = join(tmp, `ico-${size}.png`)
  render(square, size, out)
  return readFileSync(out)
})
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i
  header.writeUInt8(size % 256, entry) // 0 means 256
  header.writeUInt8(size % 256, entry + 1)
  header.writeUInt16LE(1, entry + 4) // colour planes
  header.writeUInt16LE(32, entry + 6) // bits per pixel
  header.writeUInt32LE(images[i].length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += images[i].length
})
writeFileSync('build/icon.ico', Buffer.concat([header, ...images]))

rmSync(tmp, { recursive: true })
console.log('Wrote build/icon.{svg,png,icns,ico} and resources/icon.png')
