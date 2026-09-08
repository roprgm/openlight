export type Module = {
	HEAPU8: Uint8Array<ArrayBuffer>;
	HEAPU32: Uint32Array<ArrayBuffer>;
	HEAPF32: Float32Array<ArrayBuffer>;
	_malloc(bytes: number): number;
	_free(pointer: number): void;
	_raw_create(): number;
	_raw_destroy(raw: number): void;
	_raw_open(raw: number, bytes: number, length: number): number;
	_raw_unpack(raw: number): number;
	_raw_offset(raw: number): number;
	_raw_curve(raw: number): number;
	_raw_pixels(raw: number): number;
	_raw_metadata(raw: number, output: number): number;
};
export default function create(options: {
	locateFile: (name: string) => string;
}): Promise<Module>;
