import { Card } from "@roprgm/ui/card";
import { Input } from "@roprgm/ui/input";
import { Section } from "@roprgm/ui/section";
import { type FormEvent, useState } from "react";
import { z } from "zod/mini";
import { runCommand } from "@/app/commands";
import type { createControls } from "@/app/controls";
import type { Workspace } from "@/app/workspace";
import { parse } from "@/lib/parse";
import {
  type AssistantRequest,
  assistantResponse,
  type Photo,
} from "./protocol";

type Controls = ReturnType<typeof createControls>;
type Message = { from: "user" | "assistant"; text: string };

const unavailable = "The assistant is unavailable right now.";
const failure = z.object({ error: z.string() });

function describePhoto(workspace: Workspace, controls: Controls): Photo {
  const { adjustments, vignette, details, toneCurve, preview } =
    controls.getState();
  const document = workspace.getDocument();
  const [image] = document.scene.getState().layers;
  const [width, height] = document.resources.get(image.source).image.size;
  return {
    adjustments,
    vignette: vignette.intensity,
    clarity: details.clarity,
    sharpening: details.sharpening,
    toneCurve: [...toneCurve],
    comparison: preview?.comparison ?? "edited",
    sourceSize: [width, height],
  };
}

async function ask(request: AssistantRequest) {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = failure.safeParse(body);
    throw Error(error.success ? error.data.error : unavailable);
  }
  return parse(assistantResponse, body, "Invalid assistant response");
}

/** A chat that edits the open photo: the server turns each message into commands, and the last layer they touch is selected. */
export function Assistant({
  workspace,
  controls,
}: {
  workspace: Workspace;
  controls: Controls;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const say = (from: Message["from"], text: string) =>
    setMessages((messages) => [...messages, { from, text }]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = new FormData(form).get("message")?.toString().trim();
    if (!message || busy) {
      return;
    }
    form.reset();
    const earlier = messages
      .filter(({ from }) => from === "user")
      .slice(-3)
      .map(({ text }) => text);
    say("user", message);
    setBusy(true);
    try {
      const answer = await ask({
        message,
        earlier,
        photo: describePhoto(workspace, controls),
      });
      const results = answer.commands.map((command) =>
        runCommand(workspace, command),
      );
      const layerId = results.findLast((result) => result.layerId)?.layerId;
      if (layerId) {
        controls.selectLayer(layerId);
      }
      say("assistant", answer.message);
    } catch (error) {
      say("assistant", error instanceof Error ? error.message : unavailable);
    }
    setBusy(false);
  }

  return (
    <Card className="fixed bottom-3 left-14 z-50 w-80 max-md:hidden">
      {messages.length > 0 && (
        <Section>
          {/* Reversed, so the scroll stays on the newest message. */}
          <ol className="flex max-h-60 flex-col-reverse gap-1 overflow-y-auto">
            {messages.toReversed().map((message, index) => (
              <li
                key={messages.length - index}
                className={
                  message.from === "user" ? "font-medium" : "text-muted"
                }
              >
                {message.text}
              </li>
            ))}
          </ol>
        </Section>
      )}
      <Section>
        <form aria-label="Assistant" onSubmit={submit}>
          <Input
            name="message"
            aria-label="Message"
            placeholder={busy ? "Editing…" : "Ask for an edit"}
            autoComplete="off"
            maxLength={500}
            readOnly={busy}
          />
        </form>
      </Section>
    </Card>
  );
}
