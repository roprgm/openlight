import { Badge } from "@roprgm/ui/badge";
import { IconButton } from "@roprgm/ui/icon-button";
import { Input } from "@roprgm/ui/input";
import { ScrollArea } from "@roprgm/ui/scroll-area";
import { Section, SectionAction, sections } from "@roprgm/ui/section";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { z } from "zod/mini";
import { runCommand } from "@/app/commands";
import type { createControls } from "@/app/controls";
import type { Workspace } from "@/app/workspace";
import { CloseIcon } from "@/components/icons/close";
import { SparklesIcon } from "@/components/icons/sparkles";
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

// Shown at once so focus can land, and hidden only once faded out.
const appear =
  "visible opacity-100 [transition:opacity_200ms_100ms,visibility_0s]";
const vanish =
  "invisible opacity-0 [transition:opacity_150ms,visibility_0s_150ms]";

/** A chat that edits the open photo: the server turns each message into commands, and the last layer they touch is selected. */
export function Assistant({
  workspace,
  controls,
}: {
  workspace: Workspace;
  controls: Controls;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const newest = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (messages.length > 0) {
      newest.current?.scrollIntoView({ block: "nearest" });
    }
  }, [messages.length]);
  const say = (from: Message["from"], text: string) =>
    setMessages((messages) => [...messages, { from, text }]);

  /** Opens or closes, moving focus to what shows once the state applies. */
  function show(next: boolean) {
    flushSync(() => setOpen(next));
    (next ? input : toggle).current?.focus();
  }

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

  // One glass shape grows from the button into the card: its width, height, and rounding
  // transition, and grid rows from 0fr to 1fr carry the height to the content's own. It clips
  // rather than hides overflow, so scrolling a message into view cannot scroll the shape.
  return (
    <div
      className={cn(
        "fixed bottom-3 left-14 z-50 grid overflow-clip shadow-lg shadow-fuchsia-500/10 transition-[width,grid-template-rows,border-radius] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none max-md:hidden",
        open
          ? "w-80 grid-rows-[minmax(2.5rem,1fr)] rounded-xl"
          : "w-10 grid-rows-[minmax(2.5rem,0fr)] rounded-[1.25rem]",
      )}
    >
      <span className="absolute top-1/2 left-1/2 aspect-square w-[150%] -translate-1/2 bg-conic from-fuchsia-400/40 via-sky-300/40 to-fuchsia-400/40 motion-safe:animate-[spin_10s_linear_infinite]" />
      <span className="absolute inset-px rounded-[inherit] bg-level-2/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] backdrop-blur-md" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={toggle}
              type="button"
              aria-label="Assistant"
              onClick={() => show(true)}
              className={cn(
                "relative col-start-1 row-start-1 grid size-10 place-items-center self-end text-white/80 hover:text-white",
                open ? vanish : appear,
              )}
            >
              <SparklesIcon className="size-4 drop-shadow-xs drop-shadow-fuchsia-300/50" />
            </button>
          }
        />
        <TooltipContent>Assistant</TooltipContent>
      </Tooltip>
      <div
        className={cn(
          sections({ lines: true }),
          "relative col-start-1 row-start-1 w-80 self-end",
          open ? appear : vanish,
        )}
      >
        <Section className="flex-row items-center">
          <div className="flex flex-1 items-center gap-2">
            <h2 className="font-medium">Assistant</h2>
            <Badge className="text-muted">Experimental</Badge>
          </div>
          <SectionAction>
            <IconButton
              label="Close"
              shortcut="Esc"
              size="icon"
              onClick={() => show(false)}
            >
              <CloseIcon className="size-4" />
            </IconButton>
          </SectionAction>
        </Section>
        {messages.length > 0 && (
          <Section>
            <ScrollArea fade className="*:max-h-60">
              <ol className="flex flex-col gap-1">
                {messages.map((message, index) => (
                  <li
                    key={index}
                    ref={index === messages.length - 1 ? newest : undefined}
                    className={
                      message.from === "user" ? "font-medium" : "text-muted"
                    }
                  >
                    {message.text}
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </Section>
        )}
        <Section>
          <form aria-label="Assistant" onSubmit={submit}>
            <Input
              ref={input}
              name="message"
              aria-label="Message"
              placeholder={busy ? "Editing…" : "Ask for an edit"}
              autoComplete="off"
              maxLength={500}
              readOnly={busy}
              onKeyDown={(event) => event.key === "Escape" && show(false)}
            />
          </form>
        </Section>
      </div>
    </div>
  );
}
