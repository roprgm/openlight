export type Decoder = {
	HEAPU8: Uint8Array<ArrayBuffer>;
	_malloc(size: number): number;
	_free(pointer: number): void;
	_decode(
		input: number,
		inputSize: number,
		output: number,
		outputSize: number,
		width: number,
		height: number,
		channels: number,
		raw: number,
		floating: number,
	): number;
};
export default function createDecoder(options: {
	wasmBinary: ArrayBuffer;
}): Promise<Decoder>;
