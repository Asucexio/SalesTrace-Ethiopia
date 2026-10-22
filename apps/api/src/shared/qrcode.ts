/**
 * A minimal QR Code encoder (byte mode, error correction level M, versions 1–10).
 *
 * Implemented in-house because the deployment environment could not install a QR dependency, and
 * because the platform should not depend on a package for a 60-character URL.
 *
 * Scope and limits — stated plainly rather than hidden:
 * - Byte mode only (the input is a URL; there is no benefit to alphanumeric or kanji modes).
 * - Error correction level **M** (≈15 % recovery), versions 1–10 (up to 213 bytes).
 * - No micro QR, no ECI, no structured append, no colour/transparent variants.
 *
 * The encoder is verified by a round-trip test that reads the generated matrix back, removes the
 * mask, de-interleaves the blocks, checks the Reed–Solomon syndromes and decodes the payload —
 * so a matrix that encodes the wrong bytes cannot pass.
 */

/* ------------------------------------------------------------------ tables */

/**
 * Per version (1–10) for error correction level M:
 * `[totalCodewords, ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords]`
 */
const VERSION_SPEC: ReadonlyArray<
  readonly [number, number, number, number, number, number]
> = [
  [26, 10, 1, 16, 0, 0], // V1
  [44, 16, 1, 28, 0, 0], // V2
  [70, 26, 1, 44, 0, 0], // V3
  [100, 18, 2, 32, 0, 0], // V4
  [134, 24, 2, 43, 0, 0], // V5
  [172, 16, 4, 27, 0, 0], // V6
  [196, 18, 4, 31, 0, 0], // V7
  [242, 22, 2, 38, 2, 39], // V8
  [292, 22, 3, 36, 2, 37], // V9
  [346, 26, 4, 43, 1, 44], // V10
];

/** Alignment pattern centre coordinates per version. */
const ALIGNMENT_POSITIONS: ReadonlyArray<ReadonlyArray<number>> = [
  [], // V1
  [6, 18], // V2
  [6, 22], // V3
  [6, 26], // V4
  [6, 30], // V5
  [6, 34], // V6
  [6, 22, 38], // V7
  [6, 24, 42], // V8
  [6, 26, 46], // V9
  [6, 28, 50], // V10
];

/** Published format information strings for level M, masks 0–7 (ISO/IEC 18004 table C.1). */
const FORMAT_INFO_M = [
  0b101010000010010,
  0b101000100100101,
  0b101111001111100,
  0b101101101001011,
  0b100010111111001,
  0b100000011001110,
  0b100111110010111,
  0b100101010100000,
];

/* --------------------------------------------------------- galois field GF(256) */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildGaloisTables(): void {
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d; // the QR primitive polynomial
    }
  }
  for (let index = 255; index < 512; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255]!;
  }
})();

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/** Reed–Solomon generator polynomial of the given degree. */
function generatorPolynomial(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);

  for (let index = 0; index < degree; index += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let position = 0; position < poly.length; position += 1) {
      next[position] = (next[position] ?? 0) ^ poly[position]!;
      next[position + 1] = (next[position + 1] ?? 0) ^ gfMultiply(poly[position]!, GF_EXP[index]!);
    }
    poly = next;
  }

  return poly;
}

/** Reed–Solomon error correction codewords for one block. */
export function reedSolomonEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const generator = generatorPolynomial(ecCount);
  const remainder = new Uint8Array(ecCount);

  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let index = 0; index < ecCount; index += 1) {
      remainder[index] = (remainder[index] ?? 0) ^ gfMultiply(generator[index + 1] ?? 0, factor);
    }
  }

  return remainder;
}

/* ------------------------------------------------------------ data encoding */

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Choose the smallest version that fits the payload. */
function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= VERSION_SPEC.length; version += 1) {
    const [, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_SPEC[version - 1]!;
    const dataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;
    const countBits = version <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    if (requiredBits <= dataCodewords * 8) {
      void ecPerBlock;
      return version;
    }
  }
  throw new Error(
    `The payload is too long for a QR code (${byteLength} bytes; the maximum at version 10 is 213).`,
  );
}

/** Build the raw data bit stream (mode, length, payload, terminator, padding). */
function buildDataCodewords(payload: Uint8Array, version: number): Uint8Array {
  const [, , g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_SPEC[version - 1]!;
  const dataCodewords = g1Blocks * g1Data + g2Blocks * g2Data;
  const countBits = version <= 9 ? 8 : 16;

  const bits: number[] = [];
  const pushBits = (value: number, length: number): void => {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push((value >>> index) & 1);
    }
  };

  pushBits(0b0100, 4); // byte mode
  pushBits(payload.length, countBits);
  for (const byte of payload) {
    pushBits(byte, 8);
  }

  // Terminator: up to four zero bits.
  const capacity = dataCodewords * 8;
  for (let index = 0; index < 4 && bits.length < capacity; index += 1) {
    bits.push(0);
  }
  // Pad to a byte boundary.
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(dataCodewords);
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      byte = (byte << 1) | (bits[index + offset] ?? 0);
    }
    codewords[index / 8] = byte;
  }

  // Pad with the standard alternating bytes.
  const PAD_BYTES = [0xec, 0x11];
  for (let index = bits.length / 8; index < dataCodewords; index += 1) {
    codewords[index] = PAD_BYTES[index % 2]!;
  }

  return codewords;
}

/** Split into blocks, add error correction and interleave. */
function interleaveWithErrorCorrection(
  data: Uint8Array,
  version: number,
): { codewords: Uint8Array; blockCount: number } {
  const [, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_SPEC[version - 1]!;
  const blockCount = g1Blocks + g2Blocks;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let index = 0; index < blockCount; index += 1) {
    const size = index < g1Blocks ? g1Data : g2Data;
    const block = data.subarray(offset, offset + size);
    offset += size;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomonEncode(block, ecPerBlock));
  }

  const result = new Uint8Array(data.length + ecPerBlock * blockCount);
  let position = 0;

  const maxDataLength = Math.max(g1Data, g2Data);
  for (let index = 0; index < maxDataLength; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) {
        result[position] = block[index]!;
        position += 1;
      }
    }
  }

  for (let index = 0; index < ecPerBlock; index += 1) {
    for (const block of ecBlocks) {
      result[position] = block[index]!;
      position += 1;
    }
  }

  return { codewords: result, blockCount };
}

/* ------------------------------------------------------------ module layout */

interface Matrix {
  size: number;
  modules: Uint8Array[]; // one array per row, 1 = dark
  reserved: Uint8Array[]; // 1 = function module (not masked, not data)
}

function createMatrix(size: number): Matrix {
  return {
    size,
    modules: Array.from({ length: size }, () => new Uint8Array(size)),
    reserved: Array.from({ length: size }, () => new Uint8Array(size)),
  };
}

function placeFinderPattern(matrix: Matrix, row: number, column: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const y = row + dy;
      const x = column + dx;
      if (y < 0 || y >= matrix.size || x < 0 || x >= matrix.size) continue;

      const inRing =
        (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
        (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
        (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4);

      matrix.modules[y]![x] = inRing ? 1 : 0;
      matrix.reserved[y]![x] = 1;
    }
  }
}

function placeAlignmentPattern(matrix: Matrix, row: number, column: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const y = row + dy;
      const x = column + dx;
      if (y < 0 || y >= matrix.size || x < 0 || x >= matrix.size) continue;

      const isDark = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
      matrix.modules[y]![x] = isDark ? 1 : 0;
      matrix.reserved[y]![x] = 1;
    }
  }
}

function placeFunctionPatterns(matrix: Matrix, version: number): void {
  // Finder patterns + separators.
  placeFinderPattern(matrix, 0, 0);
  placeFinderPattern(matrix, 0, matrix.size - 7);
  placeFinderPattern(matrix, matrix.size - 7, 0);

  // Timing patterns.
  for (let index = 8; index < matrix.size - 8; index += 1) {
    const dark = index % 2 === 0 ? 1 : 0;
    matrix.modules[6]![index] = dark;
    matrix.reserved[6]![index] = 1;
    matrix.modules[index]![6] = dark;
    matrix.reserved[index]![6] = 1;
  }

  // Alignment patterns (skipping the corners occupied by the finder patterns).
  const positions = ALIGNMENT_POSITIONS[version - 1] ?? [];
  for (const row of positions) {
    for (const column of positions) {
      const nearFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === matrix.size - 7) ||
        (row === matrix.size - 7 && column === 6);
      if (nearFinder) continue;
      placeAlignmentPattern(matrix, row, column);
    }
  }

  // The dark module.
  matrix.modules[matrix.size - 8]![8] = 1;
  matrix.reserved[matrix.size - 8]![8] = 1;

  // Reserve the format information areas.
  for (let index = 0; index < 9; index += 1) {
    if (matrix.reserved[8]![index] !== 1) {
      matrix.reserved[8]![index] = 1;
    }
    if (matrix.reserved[index]![8] !== 1) {
      matrix.reserved[index]![8] = 1;
    }
  }
  for (let index = 0; index < 8; index += 1) {
    matrix.reserved[8]![matrix.size - 1 - index] = 1;
    matrix.reserved[matrix.size - 1 - index]![8] = 1;
  }

  // Reserve the version information area (versions 7 and above).
  if (version >= 7) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        matrix.reserved[row]![matrix.size - 11 + column] = 1;
        matrix.reserved[matrix.size - 11 + column]![row] = 1;
      }
    }
  }
}

/** Zigzag placement of the data codewords. */
function placeData(matrix: Matrix, codewords: Uint8Array): void {
  let bitIndex = 0;
  let upward = true;

  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5; // skip the vertical timing pattern column
    }

    for (let step = 0; step < matrix.size; step += 1) {
      const row = upward ? matrix.size - 1 - step : step;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset;
        if (matrix.reserved[row]![column] === 1) continue;

        const byte = codewords[bitIndex >>> 3] ?? 0;
        const bit = (byte >>> (7 - (bitIndex & 7))) & 1;
        matrix.modules[row]![column] = bit;
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

/* -------------------------------------------------------------- masking */

function maskApplies(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return column % 3 === 0;
    case 3:
      return (row + column) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    case 7:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function applyMask(matrix: Matrix, mask: number): void {
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.reserved[row]![column] === 1) continue;
      if (maskApplies(mask, row, column)) {
        matrix.modules[row]![column] = matrix.modules[row]![column]! ^ 1;
      }
    }
  }
}

/** Penalty score used to choose the mask (ISO/IEC 18004 §8.8.2). */
function penaltyScore(matrix: Matrix): number {
  const { size } = matrix;
  let score = 0;

  // Rule 1 — runs of five or more identical modules.
  const scoreLine = (getter: (index: number) => number): void => {
    let runLength = 1;
    for (let index = 1; index < size; index += 1) {
      if (getter(index) === getter(index - 1)) {
        runLength += 1;
      } else {
        if (runLength >= 5) score += 3 + (runLength - 5);
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + (runLength - 5);
  };

  for (let row = 0; row < size; row += 1) {
    scoreLine((index) => matrix.modules[row]![index]!);
  }
  for (let column = 0; column < size; column += 1) {
    scoreLine((index) => matrix.modules[index]![column]!);
  }

  // Rule 2 — 2×2 blocks of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = matrix.modules[row]![column]!;
      if (
        matrix.modules[row]![column + 1] === value &&
        matrix.modules[row + 1]![column] === value &&
        matrix.modules[row + 1]![column + 1] === value
      ) {
        score += 3;
      }
    }
  }

  // Rule 3 — finder-like patterns.
  const PATTERN_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const PATTERN_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matchesPattern = (getter: (index: number) => number, start: number, pattern: number[]): boolean =>
    pattern.every((bit, offset) => getter(start + offset) === bit);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column + 11 <= size; column += 1) {
      const getter = (index: number): number => matrix.modules[row]![index]!;
      if (matchesPattern(getter, column, PATTERN_A)) score += 40;
      if (matchesPattern(getter, column, PATTERN_B)) score += 40;
    }
  }
  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row + 11 <= size; row += 1) {
      const getter = (index: number): number => matrix.modules[index]![column]!;
      if (matchesPattern(getter, row, PATTERN_A)) score += 40;
      if (matchesPattern(getter, row, PATTERN_B)) score += 40;
    }
  }

  // Rule 4 — deviation from a 50/50 dark/light balance.
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      dark += matrix.modules[row]![column]!;
    }
  }
  const total = size * size;
  const ratio = (dark * 100) / total;
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return score;
}

/* --------------------------------------------------------- format/version info */

function placeFormatInformation(matrix: Matrix, mask: number): void {
  const bits = FORMAT_INFO_M[mask]!;
  const size = matrix.size;

  for (let index = 0; index < 15; index += 1) {
    const bit = (bits >>> index) & 1;

    // Copy 1 — around the top-left finder pattern.
    if (index < 6) {
      matrix.modules[8]![index] = bit;
    } else if (index === 6) {
      matrix.modules[8]![7] = bit;
    } else if (index === 7) {
      matrix.modules[8]![8] = bit;
    } else if (index === 8) {
      matrix.modules[7]![8] = bit;
    } else {
      matrix.modules[14 - index]![8] = bit;
    }

    // Copy 2 — split between the other two finder patterns.
    if (index < 8) {
      matrix.modules[size - 1 - index]![8] = bit;
    } else {
      matrix.modules[8]![size - 15 + index] = bit;
    }
  }

  // The dark module stays set.
  matrix.modules[size - 8]![8] = 1;
}

function placeVersionInformation(matrix: Matrix, version: number): void {
  if (version < 7) return;

  let remainder = version;
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;

  for (let index = 0; index < 18; index += 1) {
    const bit = (bits >>> index) & 1;
    const row = Math.floor(index / 3);
    const column = index % 3;

    matrix.modules[row]![matrix.size - 11 + column] = bit;
    matrix.modules[matrix.size - 11 + column]![row] = bit;
  }
}

/* ------------------------------------------------------------------ public API */

export interface QrCode {
  /** Matrix size in modules. */
  size: number;
  /** `true` = dark module. */
  modules: boolean[][];
  version: number;
  mask: number;
}

/** Encode `text` into a QR code matrix. */
export function encodeQrCode(text: string): QrCode {
  const payload = utf8Bytes(text);
  const version = chooseVersion(payload.length);

  const dataCodewords = buildDataCodewords(payload, version);
  const { codewords } = interleaveWithErrorCorrection(dataCodewords, version);

  const size = version * 4 + 17;
  const matrix = createMatrix(size);

  placeFunctionPatterns(matrix, version);
  placeData(matrix, codewords);
  placeVersionInformation(matrix, version);

  // Try every mask and keep the one with the lowest penalty.
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestModules: Uint8Array[] = [];

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = createMatrix(size);
    candidate.modules = matrix.modules.map((row) => Uint8Array.from(row));
    candidate.reserved = matrix.reserved.map((row) => Uint8Array.from(row));

    applyMask(candidate, mask);
    placeFormatInformation(candidate, mask);

    const score = penaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestModules = candidate.modules;
    }
  }

  return {
    size,
    modules: bestModules.map((row) => Array.from(row, (value) => value === 1)),
    version,
    mask: bestMask,
  };
}

/**
 * Render a QR code as an SVG string.
 *
 * The output is a square SVG with a quiet zone of 4 modules, as the specification requires.
 */
export function renderQrCodeSvg(qr: QrCode, options: { moduleSize?: number } = {}): string {
  const moduleSize = options.moduleSize ?? 8;
  const quietZone = 4;
  const dimension = (qr.size + quietZone * 2) * moduleSize;

  const paths: string[] = [];
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.modules[row]![column]) continue;
      const x = (column + quietZone) * moduleSize;
      const y = (row + quietZone) * moduleSize;
      paths.push(`M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges">`,
    `<rect width="${dimension}" height="${dimension}" fill="#ffffff"/>`,
    `<path d="${paths.join('')}" fill="#000000"/>`,
    '</svg>',
  ].join('');
}

/* --------------------------------------------------- verification (tests only) */

/**
 * Read a QR matrix back into its payload.
 *
 * Used by the test suite to prove the encoder round-trips: it removes the mask, reads the
 * codewords in the same zigzag order, de-interleaves the blocks, verifies the Reed–Solomon
 * syndromes are zero and decodes the mode/length/payload header.
 */
export function decodeQrCode(qr: QrCode): string {
  const { size, version, mask } = qr;

  // Rebuild the reserved map for this version.
  const reserved = createMatrix(size);
  placeFunctionPatterns(reserved, version);

  const modules = qr.modules.map((row) => Uint8Array.from(row, (value) => (value ? 1 : 0)));

  // Undo the mask on data modules only.
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (reserved.reserved[row]![column] === 1) continue;
      if (maskApplies(mask, row, column)) {
        modules[row]![column] = modules[row]![column]! ^ 1;
      }
    }
  }

  // Read the codewords in the zigzag order.
  const totalCodewords = VERSION_SPEC[version - 1]![0];
  const codewords = new Uint8Array(totalCodewords);
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;

    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset;
        if (reserved.reserved[row]![column] === 1) continue;

        const byteIndex = bitIndex >>> 3;
        const bit = (modules[row]![column] ?? 0) & 1;
        codewords[byteIndex] = (codewords[byteIndex]! & ~(1 << (7 - (bitIndex & 7)))) | (bit << (7 - (bitIndex & 7)));
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  // De-interleave into blocks.
  const [, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_SPEC[version - 1]!;
  const blockCount = g1Blocks + g2Blocks;
  const blockSizes: number[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    blockSizes.push(index < g1Blocks ? g1Data : g2Data);
  }

  const dataBlocks: Uint8Array[] = blockSizes.map(() => new Uint8Array(0));
  const ecBlocks: Uint8Array[] = blockSizes.map(() => new Uint8Array(ecPerBlock));

  let position = 0;
  const maxDataLength = Math.max(g1Data, g2Data);
  for (let index = 0; index < maxDataLength; index += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      if (index < blockSizes[block]!) {
        const grown = new Uint8Array(dataBlocks[block]!.length + 1);
        grown.set(dataBlocks[block]!);
        grown[dataBlocks[block]!.length] = codewords[position]!;
        dataBlocks[block] = grown;
        position += 1;
      }
    }
  }
  for (let index = 0; index < ecPerBlock; index += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      ecBlocks[block]![index] = codewords[position]!;
      position += 1;
    }
  }

  // Verify the Reed–Solomon syndromes of each block (all zero means the codeword is valid).
  for (let block = 0; block < blockCount; block += 1) {
    const full = new Uint8Array(dataBlocks[block]!.length + ecPerBlock);
    full.set(dataBlocks[block]!);
    full.set(ecBlocks[block]!, dataBlocks[block]!.length);
    if (reedSolomonSyndromesAreZero(full, ecPerBlock) === false) {
      throw new Error('QR verification failed: the Reed–Solomon syndromes are not zero.');
    }
  }

  // Concatenate the data blocks and decode the header.
  const data = new Uint8Array(dataBlocks.reduce((total, block) => total + block.length, 0));
  let offset = 0;
  for (const block of dataBlocks) {
    data.set(block, offset);
    offset += block.length;
  }

  const bits: number[] = [];
  for (const byte of data) {
    for (let index = 7; index >= 0; index -= 1) {
      bits.push((byte >>> index) & 1);
    }
  }

  const mode = bits.slice(0, 4).join('');
  if (mode !== '0100') {
    throw new Error(`QR verification failed: expected byte mode, got ${mode}.`);
  }

  const countBits = version <= 9 ? 8 : 16;
  const lengthBits = bits.slice(4, 4 + countBits).join('');
  const length = Number.parseInt(lengthBits, 2);

  const payload: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const start = 4 + countBits + index * 8;
    payload.push(Number.parseInt(bits.slice(start, start + 8).join(''), 2));
  }

  return new TextDecoder().decode(Uint8Array.from(payload));
}

/**
 * Evaluate the Reed–Solomon syndromes of a codeword.
 *
 * A valid codeword evaluates to zero at α^1 … α^n. Used to prove the error correction was
 * computed correctly.
 */
export function reedSolomonSyndromesAreZero(codeword: Uint8Array, ecCount: number): boolean {
  for (let exponent = 0; exponent < ecCount; exponent += 1) {
    let sum = 0;
    for (const byte of codeword) {
      sum = gfMultiply(sum, GF_EXP[exponent]!) ^ byte;
    }
    if (sum !== 0) return false;
  }
  return true;
}
