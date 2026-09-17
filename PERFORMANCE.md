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

**Current:** the renderer composes passes directly. vgpu provides `timer(gpu)`, `timer.span(name)`, and `FramePassOptions.timer` for render-pass timing. The optional `timestamp-query` feature must be supported and enabled when creating the device. Results arrive asynchronously via `timer.onResults`; `gpu.settled()` covers pending timing readbacks in isolated runs or teardown. See the [vgpu guide](https://github.com/vercel-labs/vgpu/blob/main/docs/topics/performance-playbook.docs.md#13-time-passes-before-optimizing-timer).

**Planned node contract:** a node is a processing operation that may execute several GPU passes. Shared, opt-in instrumentation must work without React, identify each node instance and its passes, and collect timing centrally. Nodes declare work; they do not implement their own timing framework. Report bypasses and missing coverage explicitly, and sum a node's GPU durations only when all its passes were measured. Keep interactive timing readback asynchronous, without a queue wait after every node. The node engine and shared profiler are not implemented yet.

Fused shader operations share a pass duration; they are not individually timed. Compute dispatches and opaque package operations need supported instrumentation before claiming GPU timing coverage. Editing must work when profiling is unavailable.

Include reproducible results and their interpretation in the PR. An isolated benchmark explains cost; the complete workload establishes application impact. An environment failure is a verification gap, not evidence of unchanged performance.
