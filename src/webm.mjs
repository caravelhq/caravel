import { readFile, writeFile } from "node:fs/promises";
import { OggOpusDecoder } from "ogg-opus-decoder";

// ── OGG helpers ──────────────────────────────────────────────────────────────

// CRC-32 with the OGG generator polynomial (0x04c11db7, normal/MSB-first form)
const OGG_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let j = 0; j < 8; j++) c = (c & 0x80000000) ? ((c << 1) >>> 0) ^ 0x04c11db7 : (c << 1) >>> 0;
    t[i] = c;
  }
  return t;
})();

function oggCrc32(data) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) >>> 0) ^ OGG_CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff];
  }
  return crc >>> 0;
}

// Build a single OGG page containing one packet.
// granulePos must be a BigInt.
function buildOggPage(packet, seqNum, granulePos, serial, headerType) {
  const segs = [];
  let rem = packet.length;
  while (rem > 255) { segs.push(255); rem -= 255; }
  segs.push(rem);

  const headerLen = 27 + segs.length;
  const page = new Uint8Array(headerLen + packet.length);
  const dv = new DataView(page.buffer);

  page[0] = 79; page[1] = 103; page[2] = 103; page[3] = 83; // "OggS"
  page[4] = 0;
  page[5] = headerType;
  dv.setUint32(6,  Number(granulePos & 0xFFFFFFFFn), true);
  dv.setUint32(10, Number((granulePos >> 32n) & 0xFFFFFFFFn), true);
  dv.setUint32(14, serial >>> 0, true);
  dv.setUint32(18, seqNum, true);
  dv.setUint32(22, 0, true); // CRC placeholder
  page[26] = segs.length;
  for (let i = 0; i < segs.length; i++) page[27 + i] = segs[i];
  page.set(packet, headerLen);
  dv.setUint32(22, oggCrc32(page), true);
  return page;
}

// Assemble a complete OGG Opus stream from a CodecPrivate Opus ID header and
// an array of raw Opus packets extracted from a WebM file.
function buildOggOpus(idHeader, frames) {
  const serial = 0x57454242; // arbitrary stream serial ("WEBB")
  let seq = 0;
  const pages = [];

  // Page 1: OpusHead (BOS)
  pages.push(buildOggPage(idHeader, seq++, 0n, serial, 0x02));

  // Page 2: OpusTags (minimal)
  const enc = new TextEncoder();
  const vendor = enc.encode("webm.mjs");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(enc.encode("OpusTags"), 0);
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  // user comment count = 0 already (zero-initialised)
  pages.push(buildOggPage(tags, seq++, 0n, serial, 0x00));

  // Pages 3+: audio data — EOS flag on the last page
  for (let i = 0; i < frames.length; i++) {
    const isLast = i === frames.length - 1;
    // Granule position: each Opus frame from a browser is typically 20 ms = 960 samples at 48 kHz.
    // We accumulate an estimate; libopusfile uses this only for seeking/duration, not decoding.
    const gran = BigInt((i + 1) * 960);
    pages.push(buildOggPage(frames[i], seq++, gran, serial, isLast ? 0x04 : 0x00));
  }

  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of pages) { out.set(p, off); off += p.length; }
  return out;
}

// ── EBML / WebM parsing ───────────────────────────────────────────────────────

// Well-known element IDs
const ID_TRACKS      = 0x1654AE6B;
const ID_TRACK_ENTRY = 0xAE;
const ID_TRACK_TYPE  = 0x83;
const ID_CODEC_ID    = 0x86;
const ID_CODEC_PRIV  = 0x63A2;
const ID_CLUSTER     = 0x1F43B675;
const ID_SIMPLE_BLK  = 0xA3;
const ID_BLK_GROUP   = 0xA0;
const ID_BLOCK       = 0xA1;

// Read an EBML element ID (marker bits kept, big-endian).
function readId(buf, pos) {
  const b = buf[pos];
  if (b & 0x80) return { id: b, width: 1 };
  if (b & 0x40) return { id: (b << 8) | buf[pos + 1], width: 2 };
  if (b & 0x20) return { id: (b << 16) | (buf[pos + 1] << 8) | buf[pos + 2], width: 3 };
  if (b & 0x10) return { id: ((b << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0, width: 4 };
  throw new Error(`EBML ID byte 0x${b.toString(16)} at offset ${pos} not supported`);
}

// Read an EBML element size (marker bit stripped, returns -1 for unknown size).
function readSize(buf, pos) {
  const b = buf[pos];
  if (b & 0x80) { const v = b & 0x7F;           return { size: v === 0x7F ? -1 : v,        width: 1 }; }
  if (b & 0x40) { const v = ((b & 0x3F) << 8) | buf[pos + 1];
                                                  return { size: v === 0x3FFF ? -1 : v,       width: 2 }; }
  if (b & 0x20) { const v = ((b & 0x1F) << 16) | (buf[pos + 1] << 8) | buf[pos + 2];
                                                  return { size: v === 0x1FFFFF ? -1 : v,     width: 3 }; }
  if (b & 0x10) { const v = (((b & 0x0F) << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]) >>> 0;
                                                  return { size: v === 0x0FFFFFFF ? -1 : v,   width: 4 }; }
  // 5–8 byte sizes are huge or indicate unknown; treat all as unknown
  const w = (b & 0x08) ? 5 : (b & 0x04) ? 6 : (b & 0x02) ? 7 : 8;
  return { size: -1, width: w };
}

// Read the lacing-style VINT used in Block/SimpleBlock track-number fields.
// Same as readSize but we only need the byte width here.
function readBlockTrackWidth(buf, pos) {
  const b = buf[pos];
  if (b & 0x80) return 1;
  if (b & 0x40) return 2;
  if (b & 0x20) return 3;
  if (b & 0x10) return 4;
  return 1; // fallback
}

// Extract the Opus CodecPrivate header and all raw Opus packets from a WebM buffer.
function extractOpusFromWebm(buf) {
  let pos = 0;
  const bufLen = buf.length;

  function skipElement() {
    const { width: idW } = readId(buf, pos);
    pos += idW;
    const { size, width: szW } = readSize(buf, pos);
    pos += szW;
    if (size >= 0) pos += size;
    // unknown size: can't skip; caller must handle
    return size;
  }

  // Skip EBML header
  skipElement();

  // Expect Segment
  const { width: segIdW } = readId(buf, pos);
  pos += segIdW;
  const { size: segSize, width: segSzW } = readSize(buf, pos);
  pos += segSzW;
  const segEnd = segSize >= 0 ? pos + segSize : bufLen;

  let codecPrivate = null;
  const frames = [];

  while (pos < segEnd && pos < bufLen) {
    let elId, elIdW, elSize, elSzW;
    try {
      ({ id: elId, width: elIdW } = readId(buf, pos));
      pos += elIdW;
      ({ size: elSize, width: elSzW } = readSize(buf, pos));
      pos += elSzW;
    } catch {
      break;
    }
    const elEnd = elSize >= 0 ? pos + elSize : segEnd;

    if (elId === ID_TRACKS) {
      // Walk TrackEntry children
      let tp = pos;
      while (tp < elEnd) {
        const { id: tId, width: tIdW } = readId(buf, tp);
        tp += tIdW;
        const { size: tSize, width: tSzW } = readSize(buf, tp);
        tp += tSzW;
        const tEnd = tSize >= 0 ? tp + tSize : elEnd;

        if (tId === ID_TRACK_ENTRY) {
          let ep = tp;
          let isAudio = false;
          let codecId = "";
          let priv = null;
          while (ep < tEnd) {
            const { id: eId, width: eIdW } = readId(buf, ep);
            ep += eIdW;
            const { size: eSz, width: eSzW } = readSize(buf, ep);
            ep += eSzW;
            const eEnd = eSz >= 0 ? ep + eSz : tEnd;
            if (eId === ID_TRACK_TYPE)  isAudio = buf[ep] === 2;
            else if (eId === ID_CODEC_ID) codecId = new TextDecoder().decode(buf.subarray(ep, eEnd)).replace(/\0+$/, "");
            else if (eId === ID_CODEC_PRIV) priv = buf.slice(ep, eEnd);
            ep = eEnd;
          }
          if (isAudio && codecId === "A_OPUS" && priv) codecPrivate = priv;
        }
        tp = tEnd;
      }
    } else if (elId === ID_CLUSTER) {
      // Walk cluster children; if size is unknown, stop at the next Segment-level ID
      let cp = pos;
      while (cp < elEnd && cp < bufLen) {
        // A 4-byte EBML ID at this level signals the start of the next Segment-level element
        const peek = buf[cp];
        if ((peek & 0xF0) === 0x10) break; // 4-byte ID (e.g. next Cluster)

        let cId, cIdW, cSize, cSzW;
        try {
          ({ id: cId, width: cIdW } = readId(buf, cp));
          cp += cIdW;
          ({ size: cSize, width: cSzW } = readSize(buf, cp));
          cp += cSzW;
        } catch {
          break;
        }
        const cEnd = cSize >= 0 ? cp + cSize : elEnd;

        if (cId === ID_SIMPLE_BLK || cId === ID_BLOCK) {
          // Block header: track-num VINT + 2-byte timecode + 1-byte flags
          let bp = cp;
          bp += readBlockTrackWidth(buf, bp);
          bp += 2; // timecode
          const flags = buf[bp];
          bp += 1;
          const lacing = (flags >> 1) & 0x03;
          if (lacing === 0) {
            // No lacing — entire remainder is one Opus packet
            const frame = buf.slice(bp, cEnd);
            if (frame.length > 0) frames.push(frame);
          }
          // Laced blocks are rare in browser audio; skip them.
        } else if (cId === ID_BLK_GROUP) {
          // BlockGroup — look for the Block inside
          let gp = cp;
          while (gp < cEnd) {
            const { id: gId, width: gIdW } = readId(buf, gp);
            gp += gIdW;
            const { size: gSz, width: gSzW } = readSize(buf, gp);
            gp += gSzW;
            const gEnd = gSz >= 0 ? gp + gSz : cEnd;
            if (gId === ID_BLOCK) {
              let bp = gp;
              bp += readBlockTrackWidth(buf, bp);
              bp += 2;
              const flags = buf[bp];
              bp += 1;
              if (((flags >> 1) & 0x03) === 0) {
                const frame = buf.slice(bp, gEnd);
                if (frame.length > 0) frames.push(frame);
              }
            }
            gp = gEnd;
          }
        }
        cp = cEnd;
      }
    }

    pos = elEnd;
  }

  if (!codecPrivate) throw new Error("no Opus CodecPrivate found in WebM — is this an Opus audio file?");
  if (frames.length === 0) throw new Error("no audio frames found in WebM");
  return { idHeader: codecPrivate, frames };
}

// ── PCM helpers (shared logic with ogg.mjs) ─────────────────────────────────

function downmixToMono(channelData) {
  if (channelData.length === 0) return new Float32Array();
  if (channelData.length === 1) return channelData[0];
  const samples = channelData[0].length;
  const out = new Float32Array(samples);
  const scale = 1 / channelData.length;
  for (let i = 0; i < samples; i++) {
    let mixed = 0;
    for (const ch of channelData) mixed += ch[i] ?? 0;
    out[i] = mixed * scale;
  }
  return out;
}

function resampleLinear(input, srcRate, dstRate) {
  if (srcRate === dstRate) return input;
  if (input.length === 0) return new Float32Array();
  const dstLen = Math.max(1, Math.round((input.length * dstRate) / srcRate));
  const output = new Float32Array(dstLen);
  const ratio = srcRate / dstRate;
  for (let i = 0; i < dstLen; i++) {
    const s = i * ratio;
    const l = Math.floor(s), r = Math.min(l + 1, input.length - 1);
    output[i] = input[l] * (1 - (s - l)) + input[r] * (s - l);
  }
  return output;
}

function encodeMonoPcm16Wav(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE"); ascii(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, "data"); v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
    off += 2;
  }
  return new Uint8Array(buf);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error("usage: node src/webm.mjs <input.webm> <output.wav>");
    process.exit(2);
  }

  const webmBytes = new Uint8Array(await readFile(inputPath));
  const { idHeader, frames } = extractOpusFromWebm(webmBytes);
  const oggBytes = buildOggOpus(idHeader, frames);

  const decoder = new OggOpusDecoder({ forceStereo: false });
  try {
    await decoder.ready;
    const decoded = await decoder.decodeFile(oggBytes);
    if (!decoded.channelData.length) throw new Error("decoded audio is empty");
    const mono = downmixToMono(decoded.channelData);
    const mono16k = resampleLinear(mono, decoded.sampleRate, 16000);
    await writeFile(outputPath, encodeMonoPcm16Wav(mono16k, 16000));
  } finally {
    decoder.free();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
