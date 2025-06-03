export const TLVMessageType = {
  STRUCTURE_TYPE: 0x01,
  VERSION: 0x02,
  TRUSTED_NAME_TYPE: 0x70,
  TRUSTED_NAME_SOURCE: 0x71,
  TRUSTED_NAME: 0x20,
  CHAIN_ID: 0x23,
  ADDRESS: 0x22,
  NFT_ID: 0x72,
  SOURCE_CONTRACT: 0x73,
  CHALLENGE: 0x12,
  NOT_VALID_AFTER: 0x10,
  SIGNER_KEY_ID: 0x13,
  SIGNER_ALGORITHM: 0x14,
  DER_SIGNATURE: 0x15,
  // Dynamic Descriptor use case
  COIN_TYPE: 0x03,
  APPLICATION_NAME: 0x04,
  TICKER: 0x05,
  MAGNITUDE: 0x06,
  TUID: 0x07,
  SIGNATURE: 0x08,
};

function nameFromTag(tag) {
  for (const [key, value] of Object.entries(TLVMessageType)) {
    if (value === tag) return key;
  }
  return `UNKNOWN_TAG_0x${tag.toString(16).toUpperCase()}`;
}

// DER-like integer encoding
function encodeDerInteger(value) {
  if (value < 0x80) {
    return Buffer.from([value]);
  }
  let length = Math.ceil(Math.log2(value + 1) / 8);
  let buf = Buffer.alloc(1 + length);
  buf[0] = 0x80 | length;
  buf.writeUIntBE(value, 1, length);
  return buf;
}

// TLV packet generator
export function generateTlvPacket(tagValuePairs) {
  let packet = Buffer.alloc(0);
  for (let [tag, value] of tagValuePairs) {
    if (typeof value === "string") {
      value = Buffer.from(value, "utf8");
    } else if (typeof value === "number") {
      // Minimal big-endian encoding for integer (no leading zeros)
      if (value === 0) {
        value = Buffer.from([0]);
      } else {
        let length = Math.ceil(Math.log2(value + 1) / 8);
        let buf = Buffer.alloc(length);
        buf.writeUIntBE(value, 0, length);
        value = buf;
      }
    } else if (typeof value === "bigint") {
      // For very large numbers
      let hex = value.toString(16);
      if (hex.length % 2) hex = "0" + hex;
      value = Buffer.from(hex, "hex");
    } else if (!Buffer.isBuffer(value)) {
      throw new TypeError("Unsupported TLV value type: " + typeof value);
    }
    let tagBytes = encodeDerInteger(tag);
    let lengthBytes = encodeDerInteger(value.length);
    packet = Buffer.concat([packet, tagBytes, lengthBytes, value]);
  }
  return packet;
}

// APDU and TLV parsing utilities

export function parseApdu(hexstr) {
  let apduBytes = Buffer.from(hexstr, "hex");
  if (apduBytes.length < 5) throw new Error("APDU too short");
  let [cla, ins, p1, p2, lc] = apduBytes.slice(0, 5);
  if (apduBytes.length !== 5 + lc)
    throw new Error(`APDU length mismatch: expected ${5 + lc}, got ${apduBytes.length}`);
  let data = apduBytes.slice(5, 5 + lc);
  return { cla, ins, p1, p2, lc, data };
}

function decodeDerInteger(data, offset) {
  let first = data[offset];
  offset += 1;
  if (first < 0x80) {
    return [first, offset];
  }
  let length = first & 0x7f;
  let value = 0;
  for (let i = 0; i < length; ++i) {
    value = (value << 8) | data[offset + i];
  }
  offset += length;
  return [value, offset];
}

export function parseTlv(data) {
  let tlvs = [];
  let offset = 0;
  while (offset < data.length) {
    let [tag, offset1] = decodeDerInteger(data, offset);
    let [length, offset2] = decodeDerInteger(data, offset1);
    let value = data.slice(offset2, offset2 + length);
    offset = offset2 + length;
    let name = nameFromTag(tag);
    // @ts-ignore
    tlvs.push({ tag, value, name });
  }
  return tlvs;
}
