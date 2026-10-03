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
import { InfoIcon } from "@/components/icons/info";
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
const limited =
  "You've reached the assistant's usage limit. Try again in a little while.";
const replaced =
  "Another photo opened before the answer came, so I left it unedited.";
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
  // Vercel's firewall answers 429 once an address sends too many messages.
  if (response.status === 429) {
    throw Error(limited);
  }
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
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  // The card's height follows its content, so it grows smoothly as messages arrive too.
  useEffect(() => {
    const element = content.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize[0].blockSize),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
      const document = workspace.getDocument();
      const answer = await ask({
        message,
        earlier,
        photo: describePhoto(workspace, controls),
      });
      // The answer describes the photo that was open when the message was sent.
      if (workspace.getDocument() !== document) {
        throw Error(replaced);
      }
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

  // One shape grows from the button into the card, over content pinned to its bottom-left
  // corner, so nothing inside moves. It clips rather than hides overflow, so scrolling a message
  // into view cannot scroll the shape.
  return (
    <div
      style={open ? { height } : undefined}
      className={cn(
        "fixed bottom-3 left-14 z-50 overflow-clip material-panel bg-level-4/95 backdrop-blur-sm transition-[width,height,border-radius] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none max-md:hidden",
        open ? "w-80 rounded-xl" : "size-10 rounded-[1.25rem]",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={toggle}
              type="button"
              aria-label="Assistant"
              onClick={() => show(true)}
              className={cn(
                "absolute bottom-0 left-0 grid size-10 place-items-center text-secondary transition-colors hover:text-foreground",
                open ? vanish : appear,
              )}
            >
              <SparklesIcon className="size-4" />
            </button>
          }
        />
        <TooltipContent>Assistant</TooltipContent>
      </Tooltip>
      <div
        ref={content}
        className={cn(
          sections({ lines: true }),
          "absolute bottom-0 left-0 w-80",
          open ? appear : vanish,
        )}
      >
        <Section className="flex-row items-center">
          <div className="flex flex-1 items-center gap-1">
            <h2 className="font-medium">Assistant</h2>
            <IconButton
              label="The assistant is in beta, and its use is limited."
              size="icon-sm"
            >
              <InfoIcon className="size-3.5" />
            </IconButton>
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
          <ScrollArea fade className="*:max-h-60">
            <ol className="flex flex-col gap-1 px-3.5 py-2.5">
              {messages.map((message, index) => (
                <li
                  key={index}
                  ref={index === messages.length - 1 ? newest : undefined}
                  className={
                    message.from === "user" ? "font-medium" : "text-secondary"
                  }
                >
                  {message.text}
                </li>
              ))}
            </ol>
          </ScrollArea>
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
