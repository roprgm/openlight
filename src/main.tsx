import { TooltipProvider } from "@roprgm/ui/tooltip";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { GpuProvider } from "vgpu-react";
import { App } from "@/app";
import { GpuStats } from "@/components/gpu-stats";
import { TextLink } from "@/components/ui/text-link";
import { statsEnabled, trackGpu } from "@/lib/gpu-stats";
import "./index.css";

if (statsEnabled) {
  trackGpu();
}

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
        <p className="text-secondary">Edit photos in your browser.</p>
        <p className="max-w-md text-secondary">
          OpenLight needs WebGPU, which this browser does not provide. Open it
          in a recent Chrome, Edge, Safari, or Firefox.
        </p>
        <p className="text-secondary">{String(this.state.error)}</p>
        <TextLink href="https://github.com/roprgm/openlight">
          github.com/roprgm/openlight
        </TextLink>
      </main>
    );
  }
}

/** The adapter's own texture limit, rather than WebGPU's default, so an oversized RAW decodes far enough to report its size. */
async function gpuOptions() {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    return undefined;
  }
  const { maxTextureDimension2D } = adapter.limits;
  return { requiredLimits: { maxTextureDimension2D } };
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <>
      <GpuBoundary>
        <GpuProvider options={await gpuOptions()}>
          <TooltipProvider delay={500}>
            <App />
          </TooltipProvider>
        </GpuProvider>
      </GpuBoundary>
      {statsEnabled && <GpuStats />}
      {/* Their scripts load from Vercel's CDN; development and tests stay offline. */}
      {import.meta.env.PROD && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
    </>,
  );
}
