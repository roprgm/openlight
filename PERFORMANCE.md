# Rendering performance

Changes affecting GPU work require before/after evidence in the PR, including shader, pipeline, scheduling, and resource-lifetime changes. Measure intentional added cost separately from regressions in existing behavior. For changes that do not affect rendering work, explain why.

## Measure the workload

1. Record base and changed revisions, reproduction command or script, fixture, dimensions, working format, and parameters. Use the same device, backend, runtime, and flags for both revisions.
2. Separate setup and first-render costs from repeated rendering. Warm up the measured path, collect repeated completed samples, and report warmup count, sample count, median, and p95. Report missing samples and differences within measurement noise.
3. Measure affected passes or nodes and completed rendering. For a new effect, compare the previous workload with the changed revision's neutral or bypassed path, then report representative active cost. Include pass counts and intermediate texture sizes when they explain the result.
4. Check correctness alongside timing. Investigate unexpected regressions and explain intentional tradeoffs before calling the change ready. Use workload-specific expectations rather than universal thresholds across hardware.

| Measurement | Scope |
| --- | --- |
| CPU preparation | Work to prepare and encode commands. `performance.now()` around encoding measures this. |
| GPU duration | Timestamped GPU passes. A sum covers only the measured passes. |
| Completed-render latency | Elapsed time through completion of submitted work. State whether preparation, readback, display, or encoding is included. |

Keep unrelated work off the queue during isolated measurements. Label software adapters such as SwiftShader: their results describe that backend, not hardware GPU performance. Do not extrapolate their timings or speedup ratios to physical GPUs; validate frame budgets on reference hardware. Mocks do not execute shaders. If timestamps are unsupported, measure completed-render latency and mark GPU timing unavailable; never substitute CPU encoding time or zero for a missing GPU measurement.

## Instrumentation

[`renderNode`](src/engine/render-graph.ts) describes one render pass: a unique instance name, existing inputs, output dimensions/format (inherited from the first input by default), and an effect configured from the resolved textures. Create effects once per renderer, with separate instances for passes that have different uniforms. Return the input to bypass an operation. A feature may build several nodes, as [unsharp masking](src/lib/unsharp-mask/index.ts) does. [App composition](src/app/editor/renderer.ts) connects them for preview and export.

`createRenderGraph(gpu, timer?)` executes each reachable node once and reuses compatible targets after their last consumer. Multiple inputs and requested outputs are supported. Requested outputs remain valid until the next render or disposal; imported targets remain owned by the caller. Unneeded targets are released after rendering. `inspect()` reports executed pass names and retained intermediate texture dimensions/formats, excluding source, display, decoder, and driver allocations. There is no cross-frame result cache or shader fusion.

For GPU timing, enable the optional `timestamp-query` device feature, create a vgpu `timer(gpu)`, and pass it to the graph or `createEditorRenderer`. The graph instruments every node centrally. Results arrive asynchronously through `timer.onResults`; the caller disposes the timer. `gpu.settled()` covers timing readbacks in isolated runs or teardown. Do not wait after individual nodes during interactive editing. See the [vgpu guide](https://github.com/vercel-labs/vgpu/blob/main/docs/topics/performance-playbook.docs.md#13-time-passes-before-optimizing-timer).

The [benchmark](tests/rendering-benchmark.ts) measures uninstrumented repeated rendering, then profiles nodes in a separate run. Report bypasses and missing samples explicitly. Sum a feature's pass durations only when every pass was measured. The graph works without React and without profiling support; it currently accepts programmatically composed nodes, not user-editable or serialized graphs.

Fused shader operations share a pass duration; they are not individually timed. Compute dispatches and opaque package operations need supported instrumentation before claiming GPU timing coverage. Editing must work when profiling is unavailable.

Include reproducible results and their interpretation in the PR. An isolated benchmark explains cost; the complete workload establishes application impact. An environment failure is a verification gap, not evidence of unchanged performance.
