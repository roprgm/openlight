import { z } from "zod/mini";
import type { EditorDocument } from "@/core/document";
import { commands } from "./commands";
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
        return run(input);
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

/** Registers `get-state` and every command as WebMCP tools for browser agents until `signal` aborts. */
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
      "Describes the open photo: its file, source size in pixels, crop frame, layers from bottom to top with their IDs and settings, and undo history. Color mixer arrays list red, orange, yellow, green, aqua, blue, purple, and magenta. Call it first; when no photo is open, ask the user to open one.",
      z.strictObject({}),
      () => describe(workspace, controls),
      { readOnlyHint: true },
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
  ];
  for (const tool of tools) {
    void context.registerTool(tool, { signal });
  }
}
