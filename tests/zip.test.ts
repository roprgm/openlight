import { expect, test } from "bun:test";
import { readZip, writeZip } from "@/lib/zip";

test("zip archives round-trip stored and deflated entries and read Info-ZIP data descriptors", async () => {
  const fixture = await readZip(Bun.file("tests/fixtures/info-zip.zip"));
  expect(await fixture.get("deflated.txt")?.text()).toBe(
    "deflated by Info-ZIP ".repeat(20),
  );
  expect(await fixture.get("-")?.text()).toBe("streamed ".repeat(8));

  const bytes = new Uint8Array(70_000).map((_, index) => index * 13);
  const archive = await writeZip([
    { name: "check", data: new Blob(["123456789"]) },
    {
      name: "notes/ñandú.txt",
      data: new Blob(["ñandú ".repeat(100)]),
      deflate: true,
    },
    { name: "image.raw", data: new Blob([bytes]) },
  ]);
  // The first local header's CRC field holds the standard check value.
  const crc = new DataView(await archive.slice(14, 18).arrayBuffer());
  expect(crc.getUint32(0, true)).toBe(0xcbf43926);
  const entries = await readZip(archive);
  expect([...entries.keys()]).toEqual([
    "check",
    "notes/ñandú.txt",
    "image.raw",
  ]);
  expect(await entries.get("notes/ñandú.txt")?.text()).toBe(
    "ñandú ".repeat(100),
  );
  expect(await entries.get("image.raw")?.bytes()).toEqual(bytes);

  // A deflated entry declares its size, so a small archive can't inflate into gigabytes.
  await expect(readZip(archive, 100)).rejects.toThrow(
    "ZIP entry is too large: notes/ñandú.txt.",
  );
  // The directory sits at the end, so a truncated archive fails before any entry is read.
  await expect(readZip(archive.slice(0, 40))).rejects.toThrow(
    "Not a ZIP archive.",
  );
  const tail = archive.slice(archive.size - 22 - 3 * 46 - 30);
  await expect(readZip(new Blob([tail]))).rejects.toThrow(
    "Invalid ZIP directory.",
  );
});
