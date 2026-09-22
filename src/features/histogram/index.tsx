import { type ComponentProps, useCallback } from "react";
import type { Target } from "vgpu";
import { useGpu } from "vgpu-react";
import { useDisposable } from "@/hooks/use-disposable";
import { createHistogram } from "./histogram";

type Colors = readonly [string] | readonly [string, string, string];

/** Draws each channel as a filled polygon with an outline; one read runs at a time and the latest request wins. */
function plot(
  svg: SVGSVGElement,
  read: (image: Target) => Promise<Float32Array>,
  image: () => Target | undefined,
  colors: Colors,
) {
  const namespace = "http://www.w3.org/2000/svg";
  const group = document.createElementNS(namespace, "g");
  const curves = colors.map((color) => {
    const polygon = document.createElementNS(namespace, "polygon");
    const polyline = document.createElementNS(namespace, "polyline");
    polygon.setAttribute("fill", color);
    polygon.setAttribute("stroke", "none");
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", color);
    polyline.setAttribute("vector-effect", "non-scaling-stroke");
    group.append(polygon, polyline);
    return { polygon, polyline };
  });
  svg.append(group);
  let pending = false;
  let requested = false;
  async function update() {
    requested = true;
    if (pending) {
      return;
    }
    pending = true;
    try {
      do {
        requested = false;
        const source = image();
        if (!source) {
          for (const { polygon, polyline } of curves) {
            polygon.setAttribute("points", "");
            polyline.setAttribute("points", "");
          }
          return;
        }
        const values = await read(source);
        if (!group.isConnected) {
          return;
        }
        if (requested) {
          continue;
        }
        curves.forEach(({ polygon, polyline }, channel) => {
          const points = Array.from(
            values.subarray(channel * 256, (channel + 1) * 256),
            (y, x) => `${x},${y.toFixed(1)}`,
          ).join(" ");
          polygon.setAttribute("points", `0,100 ${points} 255,100`);
          polyline.setAttribute("points", points);
        });
      } while (requested);
    } catch (error) {
      if (group.isConnected) {
        console.error(error);
      }
    } finally {
      pending = false;
    }
  }
  return { update, dispose: () => group.remove() };
}

type Props = ComponentProps<"svg"> & {
  image: () => Target | undefined;
  subscribe: (listener: () => void) => () => void;
  colors: Colors;
  working?: boolean;
};

export function Histogram({
  image,
  subscribe,
  colors,
  working = false,
  ...props
}: Props) {
  const gpu = useGpu();
  const histogram = useDisposable(() => createHistogram(gpu), [gpu]);
  const attach = useCallback(
    (svg: SVGSVGElement | null) => {
      if (svg) {
        const chart = plot(
          svg,
          (source) => histogram.read(source, working, colors.length),
          image,
          colors,
        );
        chart.update();
        const unsubscribe = subscribe(chart.update);
        return () => {
          unsubscribe();
          chart.dispose();
        };
      }
    },
    [histogram, image, subscribe, colors, working],
  );
  return (
    <svg
      ref={attach}
      aria-label="Histogram"
      viewBox="0 0 255 100"
      preserveAspectRatio="none"
      {...props}
    />
  );
}
