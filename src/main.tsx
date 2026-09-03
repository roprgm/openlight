import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { createRoot } from "react-dom/client";
import { GpuProvider } from "vgpu-react";

import App from "./app";
import "./index.css";

const root = document.getElementById("root");

if (root) {
	createRoot(root).render(
		<>
			<GpuProvider>
				<App />
			</GpuProvider>
			<Analytics />
			<SpeedInsights />
		</>,
	);
}
