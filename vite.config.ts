import tailwindcss from "@tailwindcss/vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import react from "@vitejs/plugin-react";

export default {
  plugins: [react(), tailwindcss(), wgslVitePlugin()],
  // The linked @roprgm/ui resolves its imports from its own node_modules; share the app's.
  resolve: {
    alias: { "@": "/src" },
    dedupe: ["react", "react-dom", "@base-ui/react"],
  },
};
