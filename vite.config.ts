import tailwindcss from "@tailwindcss/vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

/** Serves the Vercel function in `api/` during development, so flags evaluate as they do on a deployment. */
function api(): Plugin {
  return {
    name: "api",
    configureServer(server) {
      server.middlewares.use("/api/flags", async (_request, response) => {
        const { GET } = (await server.ssrLoadModule(
          "/api/flags.ts",
        )) as typeof import("./api/flags");
        const result = await GET();
        response.statusCode = result.status;
        for (const [key, value] of result.headers)
          response.setHeader(key, value);
        response.end(await result.text());
      });
    },
  };
}

export default {
  plugins: [react(), tailwindcss(), wgslVitePlugin(), api()],
  resolve: { alias: { "@": "/src" } },
};
