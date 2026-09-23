import { TooltipProvider } from "@roprgm/ui/tooltip";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { GpuProvider } from "vgpu-react";
import { App } from "@/app";
import { TextLink } from "@/components/ui/text-link";
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
        <TextLink href="https://github.com/roprgm/openlight">
          github.com/roprgm/openlight
        </TextLink>
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
          <TooltipProvider delay={500}>
            <App />
          </TooltipProvider>
        </GpuProvider>
      </GpuBoundary>
      <Analytics />
      <SpeedInsights />
    </>,
  );
}
