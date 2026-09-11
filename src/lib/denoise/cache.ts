import type { Gpu, Target } from "vgpu";
import type { ImageSource, WhiteBalance } from "@/lib/image-source";
import { createDenoising } from "./index";

function createEntry(gpu: Gpu, resource: ImageSource, balance?: WhiteBalance) {
	const asShot = resource.raw?.asShot;
	const changed =
		balance &&
		(balance.temperature !== asShot?.temperature ||
			balance.tint !== asShot?.tint);
	const denoised = resource.raw?.createDenoisedPass?.();
	const raw = denoised ?? (changed ? resource.raw?.createPass() : undefined);
	let ready = false;
	let filter: ReturnType<typeof createDenoising> | undefined;
	let pending: Promise<void> | undefined;
	let disposed = false;
	async function prepare() {
		if (ready) {
			return;
		}
		if (raw && balance) {
			await raw.prepare(balance);
		}
		if (disposed) {
			throw Error("Noise reduction was cancelled.");
		}
		if (!denoised) {
			filter ??= createDenoising(gpu, raw?.render() ?? resource.image);
			await filter.prepare(100);
		}
		ready = true;
	}
	return {
		users: 0,
		texture: () =>
			ready ? (denoised?.render() ?? filter?.texture()) : undefined,
		prepare() {
			pending ??= prepare().finally(() => {
				pending = undefined;
			});
			return pending;
		},
		dispose() {
			disposed = true;
			filter?.dispose();
			raw?.dispose();
		},
	};
}

type Entry = ReturnType<typeof createEntry>;
type Cache = { users: number; entries: Map<string, Entry>; latest?: Entry };
const caches = new WeakMap<Target, Cache>();

/** Share immutable results between preview/export. Keep one idle WB result plus active readers. */
export function createCachedDenoising(gpu: Gpu, resource: ImageSource) {
	let cache = caches.get(resource.image);
	if (!cache) {
		cache = { users: 0, entries: new Map() };
		caches.set(resource.image, cache);
	}
	const shared = cache;
	shared.users++;
	let current: Entry | undefined;
	let disposed = false;
	function collect() {
		for (const [key, entry] of shared.entries) {
			if (
				shared.users === 0 ||
				(entry.users === 0 && entry !== shared.latest)
			) {
				entry.dispose();
				shared.entries.delete(key);
			}
		}
	}
	return {
		texture: () => current?.texture(),
		prepare(balance?: WhiteBalance) {
			if (disposed) {
				throw Error("Noise reduction is closed.");
			}
			const selected = resource.raw
				? (balance ?? resource.raw.asShot)
				: undefined;
			const key = selected ? `${selected.temperature}:${selected.tint}` : "rgb";
			let entry = shared.entries.get(key);
			if (!entry) {
				entry = createEntry(gpu, resource, selected);
				shared.entries.set(key, entry);
			}
			if (current !== entry) {
				if (current) {
					current.users--;
				}
				current = entry;
				current.users++;
			}
			shared.latest = entry;
			collect();
			return entry.prepare();
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			if (current) {
				current.users--;
			}
			shared.users--;
			collect();
			if (!shared.users) {
				caches.delete(resource.image);
			}
		},
	};
}
