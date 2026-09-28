import { Card } from "@roprgm/ui/card";
import { IconButton } from "@roprgm/ui/icon-button";
import { Input } from "@roprgm/ui/input";
import { ScrollArea } from "@roprgm/ui/scroll-area";
import { Section, SectionAction } from "@roprgm/ui/section";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import { type FormEvent, type Ref, useEffect, useRef, useState } from "react";
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

/** Shared by the toggle and the card, so a view transition morphs one into the other. */
const morphing = "[view-transition-name:assistant]";

/** A glass button with a slowly turning gradient ring. */
function Toggle({
  onOpen,
  ref,
}: {
  onOpen: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={ref}
            type="button"
            aria-label="Assistant"
            onClick={onOpen}
            className={cn(
              morphing,
              "fixed bottom-3 left-14 z-50 size-10 rounded-full p-px shadow-lg shadow-fuchsia-500/25 transition-transform duration-200 hover:scale-105 active:scale-95 motion-reduce:transition-none",
            )}
          >
            <span className="absolute inset-0 rounded-full bg-conic from-fuchsia-400 via-sky-300 to-fuchsia-400 motion-safe:animate-[spin_6s_linear_infinite]" />
            <span className="relative grid size-full place-items-center rounded-full bg-level-2/60 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] backdrop-blur-md">
              <SparklesIcon className="drop-shadow-[0_0_6px_var(--color-fuchsia-300)]" />
            </span>
          </button>
        }
      />
      <TooltipContent>Assistant</TooltipContent>
    </Tooltip>
  );
}

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

  /** Opens or closes, morphing between toggle and card where view transitions exist, and moves focus along. */
  function show(next: boolean) {
    const update = () => {
      flushSync(() => setOpen(next));
      (next ? input : toggle).current?.focus();
    };
    if (document.startViewTransition) {
      document.startViewTransition(update);
    } else {
      update();
    }
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

  if (!open) {
    return (
      <div className="max-md:hidden">
        <Toggle ref={toggle} onOpen={() => show(true)} />
      </div>
    );
  }
  return (
    <Card
      onKeyDown={(event) => event.key === "Escape" && show(false)}
      className={cn(morphing, "fixed bottom-3 left-14 z-50 w-80 max-md:hidden")}
    >
      <Section className="flex-row items-center">
        <h2 className="flex-1 font-medium">Assistant</h2>
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
          />
        </form>
      </Section>
    </Card>
  );
}
