import { describe, it, expect } from 'vitest'
import { parsePng } from '../assets'

describe('parsePng', () => {
  function makePng(width: number, height: number): Buffer {
    const buf = Buffer.alloc(33)
    // PNG signature
    buf[0] = 0x89
    buf[1] = 0x50
    buf[2] = 0x4e
    buf[3] = 0x47
    buf[4] = 0x0d
    buf[5] = 0x0a
    buf[6] = 0x1a
    buf[7] = 0x0a
    // IHDR chunk
    buf.writeUInt32BE(13, 8) // length
    buf.write('IHDR', 12)
    buf.writeUInt32BE(width, 16)
    buf.writeUInt32BE(height, 20)
    buf[24] = 8 // bit depth
    buf[25] = 2 // color type
    buf[26] = 0 // compression
    buf[27] = 0 // filter
    buf[28] = 0 // interlace
    return buf
  }

  it('parses a valid PNG header', () => {
    const buf = makePng(64, 64)
    const result = parsePng(buf)
    expect(result.valid).toBe(true)
    expect(result.width).toBe(64)
    expect(result.height).toBe(64)
    expect(result.bitDepth).toBe(8)
  })

  it('rejects a buffer too small', () => {
    const result = parsePng(Buffer.alloc(10))
    expect(result.valid).toBe(false)
  })

  it('rejects invalid signature', () => {
    const buf = Buffer.alloc(33)
    buf.fill(0)
    const result = parsePng(buf)
    expect(result.valid).toBe(false)
  })
})
