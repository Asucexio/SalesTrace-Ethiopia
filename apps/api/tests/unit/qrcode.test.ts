import { describe, expect, it } from 'vitest';

import {
  decodeQrCode,
  encodeQrCode,
  reedSolomonEncode,
  reedSolomonSyndromesAreZero,
  renderQrCodeSvg,
} from '../../src/shared/qrcode.js';

describe('QR encoder', () => {
  it('round-trips a tracking URL', () => {
    const url = 'https://app.salestrace.et/r/7K2M9QX4PD';
    const qr = encodeQrCode(url);

    expect(qr.size).toBe(qr.version * 4 + 17);
    expect(decodeQrCode(qr)).toBe(url);
  });

  it('round-trips a longer URL', () => {
    const url = 'https://app.salestrace.et/r/ABCDEFGHJK?utm_source=instagram&utm_medium=story';
    const qr = encodeQrCode(url);

    expect(decodeQrCode(qr)).toBe(url);
  });

  it('chooses a version that fits the payload', () => {
    expect(encodeQrCode('a').version).toBe(1);
    expect(encodeQrCode('x'.repeat(120)).version).toBeGreaterThan(1);
  });

  it('rejects a payload that is too long', () => {
    expect(() => encodeQrCode('x'.repeat(400))).toThrow(/too long/i);
  });

  it('places the three finder patterns', () => {
    const qr = encodeQrCode('https://example.test/r/ABCDEFGHJK');
    const size = qr.size;

    // The finder pattern is a 7×7 ring with a 3×3 dark centre.
    expect(qr.modules[0]![0]).toBe(true);
    expect(qr.modules[0]![6]).toBe(true);
    expect(qr.modules[6]![0]).toBe(true);
    expect(qr.modules[3]![3]).toBe(true);
    expect(qr.modules[1]![1]).toBe(false);
    expect(qr.modules[0]![size - 1]).toBe(true);
    expect(qr.modules[size - 1]![0]).toBe(true);
  });

  it('renders an SVG with a quiet zone', () => {
    const qr = encodeQrCode('https://example.test/r/ABCDEFGHJK');
    const svg = renderQrCodeSvg(qr, { moduleSize: 4 });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${(qr.size + 8) * 4}"`);
    expect(svg).toContain('</svg>');
  });

  it('computes error correction codewords whose syndromes are zero', () => {
    // The syndrome check is an independent evaluation of the codeword polynomial, so this
    // asserts a real property of the encoder rather than repeating it.
    const data = new Uint8Array([
      0x40, 0xd2, 0x75, 0x47, 0x76, 0x17, 0x32, 0x06, 0x27, 0x26, 0x96, 0x1c, 0x23, 0x2c, 0x11, 0x2e,
    ]);
    const ec = reedSolomonEncode(data, 10);

    const codeword = new Uint8Array(data.length + ec.length);
    codeword.set(data);
    codeword.set(ec, data.length);

    expect(ec).toHaveLength(10);
    expect(reedSolomonSyndromesAreZero(codeword, 10)).toBe(true);
  });
});
