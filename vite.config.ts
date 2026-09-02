import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import react from "@vitejs/plugin-react";

export default { plugins: [react(), wgslVitePlugin()] };
