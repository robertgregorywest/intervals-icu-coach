/**
 * Walking a FIT file's message stream — the one piece every reader and the
 * rewriter share.
 *
 * Deliberately partial: a message is understood only as far as its definition
 * declares field numbers, sizes and base types. Nothing here knows the global
 * profile, so a manufacturer-specific message (the Wahoo BOLT writes thousands
 * of global `65280`s) is walked by its declared size exactly like a standard
 * one — which is what lets the rewriter carry such messages through untouched
 * (`docs/adr/0012-fit-files-rewritten-in-place.md`).
 */

export class FitFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FitFormatError";
  }
}

export interface FieldDefinition {
  fieldNumber: number;
  size: number;
  baseType: number;
}

export interface MessageDefinition {
  globalMessageNumber: number;
  littleEndian: boolean;
  fields: FieldDefinition[];
  /** Total bytes of developer fields appended to each data message. */
  developerBytes: number;
}

/** One message in the stream, located by its byte span. */
export interface FitMessage {
  kind: "definition" | "data";
  localType: number;
  /** Offset of the record header byte. */
  start: number;
  /** Offset just past the message. */
  end: number;
  /** For a definition, the one it declares; for data, the one it was read by. */
  definition: MessageDefinition;
  /** For data: the position in `messages` of the definition it was read by. */
  definitionIndex: number;
  /**
   * For data: seconds since the FIT epoch — its own `timestamp` field, or the
   * value a compressed-timestamp header resolves to. Absent when neither exists.
   */
  timestamp?: number;
}

export interface FitStream {
  headerSize: number;
  /** Offset just past the last data byte, where the file CRC starts. */
  dataEnd: number;
  messages: FitMessage[];
}

export const FIELD_TIMESTAMP = 253;

/** Size in bytes of each FIT base type, indexed by the base type's low 5 bits. */
const BASE_TYPE_SIZES = [1, 1, 1, 2, 2, 4, 4, 1, 4, 8, 1, 2, 4, 1, 8, 8, 8];

/**
 * The sentinel each base type uses for "not recorded". A field carrying its
 * invalid value must be reported absent, not as a plausible-looking number:
 * an unrecorded `avg_power` decodes to 65535 W otherwise.
 */
const BASE_TYPE_INVALID = [
  0xff, 0x7f, 0xff, 0x7fff, 0xffff, 0x7fffffff, 0xffffffff, 0x00, 0xffffffff,
  0xffffffffffffffff, 0x00, 0x0000, 0x00000000, 0xff, 0x7fffffffffffffff,
  0xffffffffffffffff, 0x0000000000000000,
];

export const BASE_UINT16 = 0x84;
export const BASE_UINT32 = 0x86;

/**
 * Walk the stream. Throws `FitFormatError` when the bytes are not a FIT file or
 * a message cannot be walked — a partial walk would misplace every byte after it.
 */
export function walkFit(bytes: Uint8Array): FitStream {
  if (bytes.length < 12)
    throw new FitFormatError("Too short to be a FIT file.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) {
    throw new FitFormatError(`Unexpected FIT header size ${headerSize}.`);
  }
  // ".FIT" magic sits at offset 8 in both header lengths.
  if (
    bytes[8] !== 0x2e ||
    bytes[9] !== 0x46 ||
    bytes[10] !== 0x49 ||
    bytes[11] !== 0x54
  ) {
    throw new FitFormatError("Missing the .FIT signature.");
  }

  const dataSize = view.getUint32(4, true);
  const dataEnd = headerSize + dataSize;
  if (dataEnd > bytes.length) {
    throw new FitFormatError(
      "The header declares more data than the file holds."
    );
  }

  const definitions = new Map<
    number,
    { def: MessageDefinition; index: number }
  >();
  const messages: FitMessage[] = [];
  let lastTimestamp: number | undefined;

  let offset = headerSize;
  while (offset < dataEnd) {
    const start = offset;
    const header = bytes[offset];
    offset += 1;

    // Compressed-timestamp header: a data message whose local type lives in
    // bits 5-6 and whose timestamp is a 5-bit offset from the last full one.
    // No definition can arrive this way.
    if (header & 0x80) {
      const localType = (header >> 5) & 0x03;
      const active = definitions.get(localType);
      if (!active) throw new FitFormatError("Data before its definition.");
      let timestamp: number | undefined;
      if (lastTimestamp !== undefined) {
        const timeOffset = header & 0x1f;
        timestamp = (lastTimestamp & ~0x1f) + timeOffset;
        if (timeOffset < (lastTimestamp & 0x1f)) timestamp += 0x20;
        lastTimestamp = timestamp;
      }
      offset = dataEndOffset(active.def, offset, dataEnd);
      messages.push({
        kind: "data",
        localType,
        start,
        end: offset,
        definition: active.def,
        definitionIndex: active.index,
        timestamp,
      });
      continue;
    }

    const localType = header & 0x0f;

    if (header & 0x40) {
      const parsed = readDefinition(view, bytes, offset, (header & 0x20) !== 0);
      offset = parsed.offset;
      if (offset > dataEnd) throw new FitFormatError("Truncated definition.");
      definitions.set(localType, {
        def: parsed.definition,
        index: messages.length,
      });
      messages.push({
        kind: "definition",
        localType,
        start,
        end: offset,
        definition: parsed.definition,
        definitionIndex: messages.length,
      });
      continue;
    }

    const active = definitions.get(localType);
    if (!active) throw new FitFormatError("Data before its definition.");
    const message: FitMessage = {
      kind: "data",
      localType,
      start,
      end: dataEndOffset(active.def, offset, dataEnd),
      definition: active.def,
      definitionIndex: active.index,
    };
    const timestamp = readField(view, message, FIELD_TIMESTAMP);
    if (timestamp !== null) {
      message.timestamp = timestamp;
      lastTimestamp = timestamp;
    }
    messages.push(message);
    offset = message.end;
  }

  return { headerSize, dataEnd, messages };
}

function dataEndOffset(
  def: MessageDefinition,
  start: number,
  limit: number
): number {
  let size = def.developerBytes;
  for (const field of def.fields) size += field.size;
  const end = start + size;
  if (end > limit) throw new FitFormatError("Truncated data message.");
  return end;
}

function readDefinition(
  view: DataView,
  bytes: Uint8Array,
  start: number,
  hasDeveloperFields: boolean
): { definition: MessageDefinition; offset: number } {
  let offset = start;
  // reserved(1) is skipped; architecture(1) selects endianness for this message.
  if (offset + 5 > bytes.length)
    throw new FitFormatError("Truncated definition.");
  const littleEndian = bytes[offset + 1] === 0;
  const globalMessageNumber = view.getUint16(offset + 2, littleEndian);
  const fieldCount = bytes[offset + 4];
  offset += 5;

  const fields: FieldDefinition[] = [];
  for (let i = 0; i < fieldCount; i++) {
    if (offset + 3 > bytes.length)
      throw new FitFormatError("Truncated definition.");
    fields.push({
      fieldNumber: bytes[offset],
      size: bytes[offset + 1],
      baseType: bytes[offset + 2],
    });
    offset += 3;
  }

  let developerBytes = 0;
  if (hasDeveloperFields) {
    if (offset + 1 > bytes.length)
      throw new FitFormatError("Truncated definition.");
    const devCount = bytes[offset];
    offset += 1;
    for (let i = 0; i < devCount; i++) {
      if (offset + 3 > bytes.length)
        throw new FitFormatError("Truncated definition.");
      developerBytes += bytes[offset + 1];
      offset += 3;
    }
  }

  return {
    definition: { globalMessageNumber, littleEndian, fields, developerBytes },
    offset,
  };
}

/** Byte offset of `fieldNumber` within a data message, or -1. */
export function fieldOffset(message: FitMessage, fieldNumber: number): number {
  // A compressed-timestamp header is still one byte; the fields follow it.
  let offset = message.start + 1;
  for (const field of message.definition.fields) {
    if (field.fieldNumber === fieldNumber) return offset;
    offset += field.size;
  }
  return -1;
}

/** A field's raw (unscaled) value, or `null` when absent or invalid. */
export function readField(
  view: DataView,
  message: FitMessage,
  fieldNumber: number
): number | null {
  const field = message.definition.fields.find(
    (f) => f.fieldNumber === fieldNumber
  );
  if (!field) return null;
  return readValue(
    view,
    fieldOffset(message, fieldNumber),
    field,
    message.definition.littleEndian
  );
}

/** Every readable field of a data message, raw. */
export function readFields(
  view: DataView,
  message: FitMessage
): Map<number, number> {
  const values = new Map<number, number>();
  let offset = message.start + 1;
  for (const field of message.definition.fields) {
    const value = readValue(
      view,
      offset,
      field,
      message.definition.littleEndian
    );
    if (value !== null) values.set(field.fieldNumber, value);
    offset += field.size;
  }
  return values;
}

/**
 * Read a single field. Arrays (declared size larger than the base type) are
 * read as their first element — no field these readers use is an array, and
 * the cursor advances by the declared size regardless.
 */
function readValue(
  view: DataView,
  offset: number,
  field: FieldDefinition,
  littleEndian: boolean
): number | null {
  const type = field.baseType & 0x1f;
  const size = BASE_TYPE_SIZES[type];
  if (size === undefined || field.size < size) return null;

  let value: number;
  switch (type) {
    case 0: // enum
    case 2: // uint8
    case 10: // uint8z
    case 13: // byte
      value = view.getUint8(offset);
      break;
    case 1: // sint8
      value = view.getInt8(offset);
      break;
    case 3: // sint16
      value = view.getInt16(offset, littleEndian);
      break;
    case 4: // uint16
    case 11: // uint16z
      value = view.getUint16(offset, littleEndian);
      break;
    case 5: // sint32
      value = view.getInt32(offset, littleEndian);
      break;
    case 6: // uint32
    case 12: // uint32z
      value = view.getUint32(offset, littleEndian);
      break;
    case 8: // float32
      value = view.getFloat32(offset, littleEndian);
      break;
    case 9: // float64
      value = view.getFloat64(offset, littleEndian);
      break;
    default:
      // Strings and 64-bit integers are never read.
      return null;
  }

  if (!Number.isFinite(value)) return null;
  if (value === BASE_TYPE_INVALID[type]) return null;
  return value;
}

/**
 * Write an unsigned integer field, or its invalid sentinel for `null`. Only the
 * unsigned types the rewriter writes are supported; any other base type throws
 * rather than guessing an encoding.
 */
export function writeUnsigned(
  view: DataView,
  offset: number,
  baseType: number,
  value: number | null,
  littleEndian: boolean
): void {
  const type = baseType & 0x1f;
  const invalid = BASE_TYPE_INVALID[type];
  // The invalid sentinel is one past the largest writable value for the plain
  // types, and zero for the `z` types — clamp so a real value never reads as absent.
  const write = (max: number) =>
    value === null
      ? invalid
      : Math.max(type >= 10 ? 1 : 0, Math.min(max, Math.round(value)));
  switch (type) {
    case 2:
    case 10:
      view.setUint8(offset, write(0xfe));
      return;
    case 4:
    case 11:
      view.setUint16(offset, write(0xfffe), littleEndian);
      return;
    case 6:
    case 12:
      view.setUint32(offset, write(0xfffffffe), littleEndian);
      return;
    default:
      throw new FitFormatError(
        `Cannot write base type 0x${baseType.toString(16)}.`
      );
  }
}
