/** A ZIP archive with stored or deflated entries up to 4 GB each, using the browser's compression streams. */

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c;
});

async function crc32(blob: Blob) {
  let crc = ~0;
  const reader = blob.stream().getReader();
  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    const bytes = chunk.value;
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
  }
  return ~crc >>> 0;
}

function transform(
  blob: Blob,
  stream: CompressionStream | DecompressionStream,
) {
  return new Response(blob.stream().pipeThrough(stream)).blob();
}

/** A signature followed by little-endian fields of two or four bytes. */
function record(signature: number, fields: readonly [number, 2 | 4][]) {
  const view = new DataView(
    new ArrayBuffer(4 + fields.reduce((sum, [, size]) => sum + size, 0)),
  );
  view.setUint32(0, signature, true);
  let at = 4;
  for (const [value, size] of fields) {
    if (size === 2) {
      view.setUint16(at, value, true);
    } else {
      view.setUint32(at, value, true);
    }
    at += size;
  }
  return view.buffer;
}

export type ZipEntry = { name: string; data: Blob; deflate?: boolean };

export async function writeZip(entries: readonly ZipEntry[]) {
  const files: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;
  for (const { name, data, deflate } of entries) {
    const path = new TextEncoder().encode(name);
    const body = deflate
      ? await transform(data, new CompressionStream("deflate-raw"))
      : data;
    if (Math.max(data.size, body.size, offset) > 0xffffffff) {
      throw Error("ZIP entries are limited to 4 GB.");
    }
    // Version 2.0, UTF-8 names, method, the DOS epoch as modification time, CRC, sizes, and name length.
    const fields: [number, 2 | 4][] = [
      [20, 2],
      [0x800, 2],
      [deflate ? 8 : 0, 2],
      [0, 2],
      [0x21, 2],
      [await crc32(data), 4],
      [body.size, 4],
      [data.size, 4],
      [path.length, 2],
      [0, 2],
    ];
    files.push(record(0x04034b50, fields), path, body);
    directory.push(
      record(0x02014b50, [
        [20, 2],
        ...fields,
        [0, 2],
        [0, 2],
        [0, 2],
        [0, 4],
        [offset, 4],
      ]),
      path,
    );
    offset += 30 + path.length + body.size;
  }
  const directorySize = new Blob(directory).size;
  return new Blob([
    ...files,
    ...directory,
    record(0x06054b50, [
      [0, 2],
      [0, 2],
      [entries.length, 2],
      [entries.length, 2],
      [directorySize, 4],
      [offset, 4],
      [0, 2],
    ]),
  ]);
}

/** Entries by name, found through the central directory so archives written with data descriptors read too. */
export async function readZip(archive: Blob) {
  // The end record is 22 bytes, followed by a comment of at most 64 KiB.
  const tailStart = Math.max(0, archive.size - 22 - 0xffff);
  const tail = new DataView(await archive.slice(tailStart).arrayBuffer());
  let end = tail.byteLength - 22;
  while (end >= 0 && tail.getUint32(end, true) !== 0x06054b50) {
    end--;
  }
  if (end < 0) {
    throw Error("Not a ZIP archive.");
  }
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const start = tail.getUint32(end + 16, true);
  const directory = new DataView(
    await archive.slice(start, start + size).arrayBuffer(),
  );
  const decoder = new TextDecoder();
  const entries = new Map<string, Blob>();
  for (let at = 0, index = 0; index < count; index++) {
    if (directory.getUint32(at, true) !== 0x02014b50) {
      throw Error("Invalid ZIP directory.");
    }
    const method = directory.getUint16(at + 10, true);
    const compressed = directory.getUint32(at + 20, true);
    const nameLength = directory.getUint16(at + 28, true);
    const offset = directory.getUint32(at + 42, true);
    const name = decoder.decode(
      new Uint8Array(directory.buffer, at + 46, nameLength),
    );
    at +=
      46 +
      nameLength +
      directory.getUint16(at + 30, true) +
      directory.getUint16(at + 32, true);
    // Local headers repeat the name but may carry a different extra field.
    const local = new DataView(
      await archive.slice(offset, offset + 30).arrayBuffer(),
    );
    const data =
      offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    const body = archive.slice(data, data + compressed);
    if (method === 0) {
      entries.set(name, body);
    } else if (method === 8) {
      entries.set(
        name,
        await transform(body, new DecompressionStream("deflate-raw")),
      );
    } else {
      throw Error(`Unsupported ZIP compression in ${name}.`);
    }
  }
  return entries;
}
