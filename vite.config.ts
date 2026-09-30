import tailwindcss from "@tailwindcss/vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import react from "@vitejs/plugin-react";

export default {
  plugins: [react(), tailwindcss(), wgslVitePlugin()],
  resolve: {
    alias: { "@": "/src" },
    // The linked @roprgm/ui would otherwise bring its own copies.
    dedupe: ["react", "react-dom", "@base-ui/react"],
  },
  build: { rolldownOptions: { input: ["index.html", "about.html"] } },
};
