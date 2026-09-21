import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { GpuProvider } from "vgpu-react";

import App from "@/app";
import "./index.css";

/** GPU initialization throws during render; without WebGPU the page would otherwise stay blank. */
class GpuBoundary extends Component<
  { children: ReactNode },
  { error?: unknown }
> {
  state: { error?: unknown } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (!("error" in this.state)) {
      return this.props.children;
    }
    return (
      <main className="grid h-dvh place-content-center justify-items-center gap-3 p-6 text-center">
        <img alt="" className="w-16" height="64" src="/logo.svg" width="64" />
        <h1 className="text-2xl font-bold">OpenLight</h1>
        <p className="max-w-md text-neutral-400">
          OpenLight needs WebGPU, which this browser does not provide. Open it
          in a recent Chrome, Edge, Safari, or Firefox.
        </p>
        <p className="text-neutral-500">{String(this.state.error)}</p>
        <a
          href="https://github.com/roprgm/openlight"
          className="text-neutral-200 underline decoration-neutral-600 underline-offset-4 hover:decoration-neutral-200"
        >
          github.com/roprgm/openlight
        </a>
      </main>
    );
  }
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <>
      <GpuBoundary>
        <GpuProvider>
          <App />
        </GpuProvider>
      </GpuBoundary>
      <Analytics />
      <SpeedInsights />
    </>,
  );
}
