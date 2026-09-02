/// <reference types="vite/client" />
/// <reference types="@vgpu/wgsl/wgsl-types" />

declare module "libheif-js/libheif-wasm/libheif.js" {
	type HeifImage = {
		get_width(): number;
		get_height(): number;
		display(
			target: { data: Uint8ClampedArray; width: number; height: number },
			done: (data: unknown) => void,
		): void;
		free(): void;
	};
	type Libheif = {
		HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
	};
	export default function libheif(options: {
		wasmBinary: ArrayBuffer;
	}): Libheif;
}
