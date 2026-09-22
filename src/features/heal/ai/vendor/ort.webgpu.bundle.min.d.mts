export const env: { wasm: { wasmPaths: { wasm: string } } };

export class Tensor {
  constructor(type: "uint8", data: Uint8Array, dimensions: number[]);
  readonly data: ArrayLike<number>;
  dispose(): void;
}

export const InferenceSession: {
  create(
    bytes: ArrayBuffer,
    options: {
      executionProviders: [{ name: "webgpu"; device: GPUDevice }];
      graphOptimizationLevel: string;
    },
  ): Promise<{
    outputNames: string[];
    run(inputs: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
  }>;
};
