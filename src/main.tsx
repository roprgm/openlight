import { TooltipProvider } from "@roprgm/ui/tooltip";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { GpuProvider } from "vgpu-react";
import { App } from "@/app";
import { Splash } from "@/app/splash";
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
      <Splash>
        <p className="mt-4 max-w-md text-muted">
          OpenLight needs WebGPU, which this browser does not provide. Open it
          in a recent Chrome, Edge, Safari, or Firefox.
        </p>
        <p className="text-muted">{String(this.state.error)}</p>
        <TextLink href="https://github.com/roprgm/openlight">
          github.com/roprgm/openlight
        </TextLink>
      </Splash>
    );
  }
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <>
      <GpuBoundary>
        <GpuProvider fallback={<Splash />}>
          <TooltipProvider delay={500}>
            <App />
          </TooltipProvider>
        </GpuProvider>
      </GpuBoundary>
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
