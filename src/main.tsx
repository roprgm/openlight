import { TooltipProvider } from "@roprgm/ui/tooltip";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Component, type ReactNode, Suspense, use } from "react";
import { createRoot } from "react-dom/client";
import { initFromDevice } from "vgpu";
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

/**
 * A device with its adapter's own texture limit rather than WebGPU's default, which stops at
 * 8,192 pixels a side; it lives as long as the page.
 */
async function createGpu() {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    throw Error("This browser offers no WebGPU adapter.");
  }
  const { maxTextureDimension2D } = adapter.limits;
  const device = await adapter.requestDevice({
    requiredLimits: { maxTextureDimension2D },
  });
  return initFromDevice(device);
}

const gpu = createGpu();

/** Provides the page's GPU once it exists; a failure reaches the boundary above. */
function PageGpu({ children }: { children: ReactNode }) {
  return <GpuProvider gpu={use(gpu)}>{children}</GpuProvider>;
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <>
      <GpuBoundary>
        <Suspense>
          <PageGpu>
            <TooltipProvider delay={500}>
              <App />
            </TooltipProvider>
          </PageGpu>
        </Suspense>
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
