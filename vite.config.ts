import tailwindcss from "@tailwindcss/vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { createAssistantHandler } from "./src/app/assistant/server.js";

/** Serves `api/assistant` in development, with the key from `.env.local`. */
function assistant(): Plugin {
  return {
    name: "assistant",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      const handle = createAssistantHandler({
        apiKey: env.AI_GATEWAY_API_KEY,
      });
      server.middlewares.use("/api/assistant", async (request, response) => {
        let body = "";
        for await (const chunk of request) {
          body += chunk;
        }
        const answer = await handle(
          new Request("http://localhost/api/assistant", {
            method: request.method,
            body: request.method === "POST" ? body : undefined,
          }),
        );
        response.statusCode = answer.status;
        response.setHeader("content-type", "application/json");
        response.end(await answer.text());
      });
    },
  };
}

export default {
  plugins: [react(), tailwindcss(), wgslVitePlugin(), assistant()],
  resolve: { alias: { "@": "/src" } },
};
