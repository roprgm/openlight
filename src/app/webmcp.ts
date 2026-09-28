import { z } from "zod/mini";
import type { EditorDocument } from "@/core/document";
import { parse } from "@/lib/parse";
import { commands, runCommand } from "./commands";
import type { createControls } from "./controls";
import type { Workspace } from "./workspace";

type Controls = ReturnType<typeof createControls>;

type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: unknown) => Promise<unknown>;
};

type RegisteredTool = { name: string; description: string };

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(
        tool: ModelContextTool,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
      getTools(): Promise<RegisteredTool[]>;
      executeTool(tool: RegisteredTool, input: string): Promise<string>;
    };
  }
}

function defineTool(
  name: string,
  description: string,
  input: z.ZodMiniType,
  run: (input: unknown) => unknown,
  annotations?: ModelContextTool["annotations"],
): ModelContextTool {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(input, { io: "input" }),
    annotations,
    async execute(input) {
      try {
        return await run(input);
      } catch (error) {
        // Returned, since browsers pass a thrown error to the agent without its message.
        return String(error);
      }
    },
  };
}

function sourceSize(document: EditorDocument) {
  const [image] = document.scene.getState().layers;
  return document.resources.get(image.source).image.size;
}

/** The open photo as an agent reads it; brush strokes and healing patches are counted, not listed. */
function describe(workspace: Workspace, controls: Controls) {
  const { file, failure, scene, selectedLayerId, preview, history } =
    controls.getState();
  const document = workspace.state.getState().document;
  const state = {
    file,
    failure,
    sourceSize: document && sourceSize(document),
    frame: scene?.frame,
    layers: scene?.layers,
    selectedLayerId,
    comparison: preview?.comparison,
    history,
  };
  return JSON.stringify(state, (key, value) =>
    Array.isArray(value) && (key === "strokes" || key === "patches")
      ? `${value.length} omitted`
      : value,
  );
}

const openImage = z.strictObject({ url: z.url({ protocol: /^https?$/ }) });
const batch = z.strictObject({
  commands: z.array(z.looseObject({ type: z.string() })).check(z.minLength(1)),
});

/** Registers `get-state`, `open-image`, every command, and `run-commands` as WebMCP tools for browser agents until `signal` aborts. */
export function registerTools(
  workspace: Workspace,
  controls: Controls,
  signal: AbortSignal,
) {
  const context = document.modelContext;
  if (!context) {
    return;
  }
  const tools = [
    defineTool(
      "get-state",
      "Describes the open photo: its file, source size in pixels, crop frame, layers from bottom to top with their IDs and settings, and undo history. Color mixer arrays list red, orange, yellow, green, aqua, blue, purple, and magenta. Call it first; when no photo is open, open one with open-image or ask the user to open one.",
      z.strictObject({}),
      () => describe(workspace, controls),
      { readOnlyHint: true },
    ),
    defineTool(
      "open-image",
      "Opens the image at url in place of the open photo, with a new undo history, and describes it like get-state. The page fetches url, so another origin must allow CORS. To open a local file, such as an image attached to the chat, serve it over HTTP with CORS and pass its URL; the browser may first ask the user to let the page reach local addresses.",
      openImage,
      async (input) => {
        const { url } = parse(openImage, input, "Invalid open-image");
        if (await controls.loadUrl(url)) {
          return describe(workspace, controls);
        }
        const reason =
          controls.getState().failure?.error ?? "another file opened instead";
        throw Error(`Couldn't open ${url}: ${reason}`);
      },
    ),
    ...Object.entries(commands).map(([type, command]) =>
      defineTool(type, command.description, command.input, (input) => {
        const result = command.execute(
          workspace.getDocument(),
          input,
          `Invalid ${type}`,
        );
        return result.layerId ? result : "Done.";
      }),
    ),
    defineTool(
      "run-commands",
      "Runs several commands in order in one call. Each command is an object with the name of another tool as its type, such as set-adjustments or add-mask, and that tool's fields. Each is its own undo step. Returns each command's result; at the first error it stops and says which command failed, keeping the ones before it.",
      batch,
      (input) => {
        const { commands: list } = parse(batch, input, "Invalid run-commands");
        return list.map((command, index) => {
          try {
            return runCommand(workspace, command);
          } catch (error) {
            throw Error(
              `Command ${index + 1} of ${list.length} failed, after the ones before it ran: ${String(error)}`,
            );
          }
        });
      },
    ),
  ];
  for (const tool of tools) {
    void context.registerTool(tool, { signal });
  }
}
