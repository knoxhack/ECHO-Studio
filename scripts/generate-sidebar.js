/**
 * Generate a 164x314 BMP for NSIS installer sidebar.
 */
const fs = require('fs')
const path = require('path')

const W = 164
const H = 314
const OUT = path.join(__dirname, '..', 'build', 'installer-sidebar.bmp')

const BG = { r: 10, g: 14, b: 20 }
const ACCENT = { r: 46, g: 230, b: 200 }

function pixel(x, y) {
  const t = y / H
  // Gradient from dark to slightly lighter
  return {
    r: Math.round(BG.r + (BG.r + 10) * t),
    g: Math.round(BG.g + (BG.g + 10) * t),
    b: Math.round(BG.b + (BG.b + 15) * t)
  }
}

function writeBmp() {
  const rowSize = Math.ceil((W * 3) / 4) * 4 // 24-bit BMP rows are padded to 4-byte boundary
  const pixelData = Buffer.alloc(rowSize * H)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = pixel(x, y)
      const offset = (H - 1 - y) * rowSize + x * 3
      pixelData[offset] = p.b
      pixelData[offset + 1] = p.g
      pixelData[offset + 2] = p.r
    }
  }

  const fileHeader = Buffer.alloc(14)
  fileHeader.write('BM', 0)
  const pixelOffset = 14 + 40
  const fileSize = pixelOffset + pixelData.length
  fileHeader.writeUInt32LE(fileSize, 2)
  fileHeader.writeUInt32LE(0, 6)
  fileHeader.writeUInt32LE(pixelOffset, 10)

  const dibHeader = Buffer.alloc(40)
  dibHeader.writeUInt32LE(40, 0)
  dibHeader.writeInt32LE(W, 4)
  dibHeader.writeInt32LE(H, 8)
  dibHeader.writeUInt16LE(1, 12)
  dibHeader.writeUInt16LE(24, 14)
  dibHeader.writeUInt32LE(0, 16)
  dibHeader.writeUInt32LE(pixelData.length, 20)
  dibHeader.writeInt32LE(2835, 24)
  dibHeader.writeInt32LE(2835, 28)
  dibHeader.writeUInt32LE(0, 32)
  dibHeader.writeUInt32LE(0, 36)

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, Buffer.concat([fileHeader, dibHeader, pixelData]))
  console.log(`Generated ${OUT} (${W}x${H})`)
}

writeBmp()
