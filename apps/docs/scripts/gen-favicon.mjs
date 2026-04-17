import { writeFileSync } from 'node:fs'

const W = 16, H = 16
const px = new Uint8Array(W * H * 4)

function lerp(a, b, t) { return Math.round(a + (b - a) * t) }
function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = ((H - 1 - y) * W + x) * 4
  px[i + 0] = b
  px[i + 1] = g
  px[i + 2] = r
  px[i + 3] = a
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H - 2)
    const r = lerp(0x63, 0xec, t)
    const g = lerp(0x66, 0x48, t)
    const b = lerp(0xf1, 0x99, t)
    setPx(x, y, r, g, b, 255)
  }
}

const nodes = [[4, 4], [11, 4], [7, 7], [4, 11], [11, 11]]
function line(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1
  let err = dx + dy, x = x0, y = y0
  while (true) {
    setPx(x, y, 255, 255, 255)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
}
line(4, 4, 7, 7); line(11, 4, 7, 7); line(4, 11, 7, 7); line(11, 11, 7, 7)

for (const [cx, cy] of nodes) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx * dx + dy * dy <= 2) setPx(cx + dx, cy + dy, 255, 255, 255)
}

const andMask = new Uint8Array((W * H) / 8)
const dibHeader = Buffer.alloc(40)
dibHeader.writeUInt32LE(40, 0)
dibHeader.writeInt32LE(W, 4)
dibHeader.writeInt32LE(H * 2, 8)
dibHeader.writeUInt16LE(1, 12)
dibHeader.writeUInt16LE(32, 14)
dibHeader.writeUInt32LE(0, 16)
dibHeader.writeUInt32LE(0, 20)

const imageData = Buffer.concat([dibHeader, Buffer.from(px), Buffer.from(andMask)])
const dir = Buffer.alloc(6)
dir.writeUInt16LE(0, 0)
dir.writeUInt16LE(1, 2)
dir.writeUInt16LE(1, 4)
const entry = Buffer.alloc(16)
entry.writeUInt8(W, 0)
entry.writeUInt8(H, 1)
entry.writeUInt8(0, 2)
entry.writeUInt8(0, 3)
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(imageData.length, 8)
entry.writeUInt32LE(22, 12)

const ico = Buffer.concat([dir, entry, imageData])
writeFileSync(new URL('../app/favicon.ico', import.meta.url), ico)
console.log(`wrote favicon.ico (${ico.length} bytes)`)
