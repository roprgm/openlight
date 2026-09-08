/**
 * Decoder backed by a worker module: post the file, receive transferred pixels or an error.
 * Workers own parsing and decompression; GPU import owns pixel processing.
 */
export function workerDecoder<T>(
	load: () => Promise<{ default: new () => Worker }>,
) {
	return async (): Promise<(file: Blob) => Promise<T>> => {
		const { default: Spawn } = await load();
		return (file) =>
			new Promise((resolve, reject) => {
				const worker = new Spawn();
				const fail = (message: string) => {
					worker.terminate();
					reject(new Error(message));
				};
				worker.onerror = (event) => {
					event.preventDefault();
					fail(event.message);
				};
				worker.onmessageerror = () => fail("Cannot read decoder output.");
				worker.onmessage = ({ data }: MessageEvent<T | { error: string }>) => {
					typeof data === "object" && data !== null && "error" in data
						? reject(new Error(data.error))
						: resolve(data as T);
					worker.terminate();
				};
				try {
					worker.postMessage(file);
				} catch (error) {
					worker.terminate();
					reject(error);
				}
			});
	};
}
