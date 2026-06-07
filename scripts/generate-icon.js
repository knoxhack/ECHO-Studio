/**
 * Generate a 256x256 ICO file from a simple geometric design.
 * Writes BMP data (no compression) into an ICO container.
 */
const fs = require('fs')
const path = require('path')

const SIZE = 256
const OUT = path.join(__dirname, '..', 'build', 'icon.ico')

// Palette: dark bg + cyan accent + blue secondary
const BG = { r: 10, g: 14, b: 20 }
const ACCENT = { r: 46, g: 230, b: 200 }
const ACCENT2 = { r: 56, g: 182, b: 255 }

function pixel(x, y) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  const dx = x - cx
  const dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx)

  // Outer ring
  if (dist > 110 && dist < 120) {
    const grad = (Math.sin(angle * 3) + 1) / 2
    return blend(ACCENT, ACCENT2, grad)
  }

  // Inner hexagon-like shape
  const hex = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy) / 1.5)
  if (hex < 70 && dist < 100) {
    // Glow gradient from center
    const t = dist / 100
    return blend(ACCENT, BG, t)
  }

  // Corner accents
  if ((Math.abs(dx) > 90 && Math.abs(dy) > 90) && dist < 125) {
    return ACCENT2
  }

  return BG
}

function blend(a, b, t) {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t)
  }
}

function writeBmp() {
  const rowSize = SIZE * 4
  const pixelData = Buffer.alloc(rowSize * SIZE)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = pixel(x, y)
      const offset = (SIZE - 1 - y) * rowSize + x * 4 // BMP is bottom-up
      pixelData[offset] = p.b
      pixelData[offset + 1] = p.g
      pixelData[offset + 2] = p.r
      pixelData[offset + 3] = 255
    }
  }

  // BMP file header (14 bytes)
  const fileHeader = Buffer.alloc(14)
  fileHeader.write('BM', 0)
  const pixelOffset = 14 + 40
  const fileSize = pixelOffset + pixelData.length
  fileHeader.writeUInt32LE(fileSize, 2)
  fileHeader.writeUInt32LE(0, 6) // reserved
  fileHeader.writeUInt32LE(pixelOffset, 10)

  // DIB header (BITMAPINFOHEADER, 40 bytes)
  const dibHeader = Buffer.alloc(40)
  dibHeader.writeUInt32LE(40, 0) // header size
  dibHeader.writeInt32LE(SIZE, 4) // width
  dibHeader.writeInt32LE(SIZE, 8) // height
  dibHeader.writeUInt16LE(1, 12) // planes
  dibHeader.writeUInt16LE(32, 14) // bits per pixel
  dibHeader.writeUInt32LE(0, 16) // compression (none)
  dibHeader.writeUInt32LE(pixelData.length, 20) // image size
  dibHeader.writeInt32LE(2835, 24) // x pixels/meter
  dibHeader.writeInt32LE(2835, 28) // y pixels/meter
  dibHeader.writeUInt32LE(0, 32) // colors in palette
  dibHeader.writeUInt32LE(0, 36) // important colors

  return Buffer.concat([fileHeader, dibHeader, pixelData])
}

function writeIco(bmpBuf) {
  // ICO header
  const icoHeader = Buffer.alloc(6)
  icoHeader.writeUInt16LE(0, 0) // reserved
  icoHeader.writeUInt16LE(1, 2) // type (1 = icon)
  icoHeader.writeUInt16LE(1, 4) // count

  // ICONDIRENTRY
  const entry = Buffer.alloc(16)
  entry.writeUInt8(SIZE > 255 ? 0 : SIZE, 0) // width
  entry.writeUInt8(SIZE > 255 ? 0 : SIZE, 1) // height
  entry.writeUInt8(0, 2) // colors (0 = >256)
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(bmpBuf.length, 8) // size
  entry.writeUInt32LE(6 + 16, 12) // offset

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, Buffer.concat([icoHeader, entry, bmpBuf]))
  console.log(`Generated ${OUT} (${SIZE}x${SIZE})`)
}

writeIco(writeBmp())
