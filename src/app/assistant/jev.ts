import type { Experimental_EvaluationQuestion as Question } from "ai";
import { z } from "zod/mini";
import type { Command } from "@/app/commands";
import type { Adjustments } from "@/core/document";
import type { AssistantRequest, AssistantResponse, Photo } from "./protocol.js";

/**
 * How the assistant asks Jev, an evaluation model: one call answers typed questions about the
 * message in parallel, each by choosing among options, and the answers become commands.
 */

/** A control Jev sets by choosing one of its steps. */
type Slider = {
  /** What choosing it does, among the commands. */
  command: string;
  label: string;
  min: number;
  max: number;
  step: number;
  read: (photo: Photo) => number;
};

function adjustment(
  key: keyof Adjustments,
  command: string,
  label: string,
  limit: number,
  step: number,
): Slider & { key: keyof Adjustments } {
  return {
    key,
    command,
    label,
    min: -limit,
    max: limit,
    step,
    read: (photo) => photo.adjustments[key],
  };
}

/** Controls a mask can hold, so they can change one area. */
const adjustments = {
  exposure: adjustment(
    "exposure",
    "Exposure: make the whole image lighter or darker.",
    "exposure (brightness, in stops)",
    5,
    0.5,
  ),
  contrast: adjustment(
    "contrast",
    "Contrast: more or less difference between light and dark.",
    "contrast",
    100,
    10,
  ),
  highlights: adjustment(
    "highlights",
    "Highlights: recover or brighten the bright areas.",
    "highlights (bright areas)",
    100,
    10,
  ),
  shadows: adjustment(
    "shadows",
    "Shadows: lift or deepen the dark areas.",
    "shadows (dark areas)",
    100,
    10,
  ),
  whites: adjustment(
    "whites",
    "Whites: move the white point.",
    "whites (white point)",
    100,
    10,
  ),
  blacks: adjustment(
    "blacks",
    "Blacks: move the black point.",
    "blacks (black point)",
    100,
    10,
  ),
  temperature: adjustment(
    "incrementalTemperature",
    "Temperature: warmer (yellow) or cooler (blue).",
    "temperature (warmer or cooler)",
    100,
    10,
  ),
  tint: adjustment(
    "incrementalTint",
    "Tint: greener or more magenta.",
    "tint (green or magenta)",
    100,
    10,
  ),
  vibrance: adjustment(
    "vibrance",
    "Vibrance: more or less color, gently, protecting vivid colors and skin. The usual choice for “more color”.",
    "vibrance (muted colors)",
    100,
    10,
  ),
  saturation: adjustment(
    "saturation",
    "Saturation: more or less color everywhere, down to black and white.",
    "saturation (all colors)",
    100,
    10,
  ),
};

/** Controls on effect layers, which change the whole photo. */
const effects = {
  vignette: {
    command: "Vignette: darker edges.",
    label: "vignette (darker edges)",
    min: 0,
    max: 100,
    step: 5,
    read: (photo) => photo.vignette,
  },
  clarity: {
    command: "Clarity: local contrast, punchier or softer texture.",
    label: "clarity (local contrast)",
    min: -100,
    max: 100,
    step: 10,
    read: (photo) => photo.clarity,
  },
  sharpening: {
    command: "Sharpening: crisper detail.",
    label: "sharpening",
    min: 0,
    max: 150,
    step: 10,
    read: (photo) => photo.sharpening,
  },
} satisfies Record<string, Slider>;

const sliders: Record<string, Slider> = { ...adjustments, ...effects };

const inverted = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

function isInverted({ toneCurve }: Photo) {
  return (
    toneCurve.length === 2 &&
    toneCurve.every(({ x, y }, i) => x === inverted[i].x && y === inverted[i].y)
  );
}

type Tool = {
  description: string;
  run: (photo: Photo) => { commands: Command[]; message: string };
};

function crop(label: string, description: string, aspectRatio?: number): Tool {
  return {
    description,
    run: () => ({
      commands: [{ type: "set-crop", aspectRatio }],
      message: label,
    }),
  };
}

/** Commands beside the sliders; replying instead of editing is the `reply` question. */
const tools: Record<string, Tool> = {
  invert: {
    description: "Invert the colors into a negative, or back.",
    run: (photo) =>
      isInverted(photo)
        ? {
            commands: [{ type: "set-tone-curve" }],
            message: "Colors restored",
          }
        : {
            commands: [{ type: "set-tone-curve", points: inverted }],
            message: "Colors inverted",
          },
  },
  reset: {
    description: "Reset every edit, returning the photo to how it was opened.",
    run: () => ({ commands: [{ type: "reset" }], message: "Reset all edits" }),
  },
  undo: {
    description: "Undo the last change.",
    run: () => ({ commands: [{ type: "undo" }], message: "Undone" }),
  },
  redo: {
    description: "Redo the last undone change.",
    run: () => ({ commands: [{ type: "redo" }], message: "Redone" }),
  },
  original: {
    description: "Show the original photo for comparison, keeping the edits.",
    run: () => ({
      commands: [{ type: "set-preview", comparison: "original" }],
      message: "Showing the original. Say “show my edits” to go back.",
    }),
  },
  split: {
    description: "Compare before and after side by side.",
    run: () => ({
      commands: [{ type: "set-preview", comparison: "split" }],
      message: "Showing before and after",
    }),
  },
  edited: {
    description: "Show the edited photo again after showing the original.",
    run: () => ({
      commands: [{ type: "set-preview", comparison: "edited" }],
      message: "Showing your edits",
    }),
  },
  "crop-1:1": crop("Cropped to 1:1", "Crop to a square.", 1),
  "crop-4:5": crop(
    "Cropped to 4:5",
    "Crop to 4:5 portrait, as for an Instagram post.",
    4 / 5,
  ),
  "crop-3:2": crop("Cropped to 3:2", "Crop to 3:2 landscape.", 3 / 2),
  "crop-16:9": crop("Cropped to 16:9", "Crop to 16:9 widescreen.", 16 / 9),
  "crop-9:16": crop(
    "Cropped to 9:16",
    "Crop to 9:16 vertical, as for a story.",
    9 / 16,
  ),
  "crop-none": crop("Crop removed", "Remove the crop."),
};

const reply =
  "Answer with a message instead of editing: a greeting, thanks, a question, an exact number, something the editor cannot do, or anything unrelated to this photo.";

/** Canned answers: conversation first, then why a request cannot be done. */
const replies: Record<string, string> = {
  greeting:
    "Hi! I can edit this photo for you. Try “make it warmer” or “darken the sky”.",
  thanks: "You're welcome! Anything else you'd like to change?",
  approval: "Great! Tell me if you'd like to change anything else.",
  goodbye: "Bye! Your edits stay saved in this browser.",
  capabilities:
    "I can change exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, vignette, clarity, and sharpening, in the whole photo or the sky, ground, sides, or center. I can also crop, invert colors, compare before and after, reset, and undo.",
  "how-to":
    "Tell me what to change in plain words, like “brighter and warmer”, “more contrast in the sky”, or “crop it for Instagram”.",
  identity:
    "I'm Jev, a quick assistant that edits this photo from short requests.",
  opinion:
    "I can't judge photos, but I can change whatever you'd like to improve.",
  export: "To save your photo, use Export in the top right.",
  open: "To edit another photo, use the folder button next to the file name.",
  "off-topic": "I can only help with editing this photo.",
  "unsupported-edit":
    "I can't do that edit yet. I can change light, color, detail, and vignette, crop, and invert colors.",
  "exact-value":
    "I can't set exact numbers yet; I move controls in steps. Try “a bit brighter” or “much more contrast”.",
  "out-of-range": "That's beyond what this control allows.",
  "several-areas":
    "I can change one area at a time. Ask for the sky and the ground separately.",
  unclear:
    "I'm not sure what to change. Try something like “brighter”, “warmer”, or “more contrast”.",
};

const areas = {
  photo: "The whole photo.",
  top: "The top of the photo, such as the sky.",
  bottom: "The bottom of the photo, such as the ground or foreground.",
  left: "The left side of the photo.",
  right: "The right side of the photo.",
  center: "The center of the photo, such as the main subject.",
};

const counts: Record<string, number> = { one: 1, two: 2, three: 3 };

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Words for a change's size, so a plain "brighter" lands on a moderate step. */
function magnitude(change: number, { min, max }: Slider) {
  const share = Math.abs(change) / (max - min);
  if (share <= 0.05) {
    return "slightly";
  }
  if (share <= 0.15) {
    return "moderately";
  }
  return share <= 0.3 ? "strongly" : "extremely";
}

/** Every step from min to max, each described by its change from the current value. */
function valueQuestion(slider: Slider, current: number): Question {
  const { min, max, step } = slider;
  const count = Math.round((max - min) / step);
  const options = Array.from({ length: count + 1 }, (_, i) => {
    const value = round(min + i * step);
    const change = round(value - current);
    const direction = change > 0 ? "more" : "less";
    const notes = [
      change
        ? `${change > 0 ? "+" : ""}${change}, ${magnitude(change, slider)} ${direction}`
        : "the current value",
      value === 0 && "the default",
      value === min && "the minimum",
      value === max && "the maximum",
    ].filter(Boolean);
    // A fixed decimal keeps keys from sorting as integers, so options stay in order.
    return [value.toFixed(1), notes.join(", ")];
  });
  return {
    type: "choice",
    instructions: `The ${slider.label} the request asks for, now ${current}. Each option notes its change from now. Without a stated amount, prefer a moderate change.`,
    criteria: Object.fromEntries(options),
  };
}

/**
 * The state and questions for one message: how many changes it names, the command that fits best
 * with the others ranked behind it, the area, a reply, and each slider's value in case it is chosen.
 */
export function ask({ message, earlier, photo }: AssistantRequest) {
  const current = Object.fromEntries(
    Object.entries(sliders).map(([id, slider]) => [id, slider.read(photo)]),
  );
  const commands = Object.fromEntries([
    ...Object.entries(sliders).map(([id, slider]) => [id, slider.command]),
    ...Object.entries(tools).map(([id, tool]) => [id, tool.description]),
    ["reply", reply],
  ]);
  const values = Object.entries(sliders).map(([id, slider]) => [
    `value-${id}`,
    valueQuestion(slider, slider.read(photo)),
  ]);
  const questions: Record<string, Question> = {
    count: {
      type: "choice",
      instructions: "How many different changes the request names.",
      criteria: {
        one: "One change, even if described with several words.",
        two: "Two different changes, such as “warmer and darker”.",
        three: "Three different changes.",
      },
    },
    command: {
      type: "choice",
      instructions:
        "The command that best fulfills the request; when it names several changes, each of them.",
      criteria: commands,
    },
    area: {
      type: "choice",
      instructions: "Which part of the photo the change applies to.",
      criteria: areas,
    },
    reply: {
      type: "choice",
      instructions: "The message that best answers the request.",
      criteria: replies,
    },
    ...Object.fromEntries(values),
  };
  return {
    state: { request: message, earlierRequests: earlier, current },
    questions,
  };
}

const answersSchema = z.record(
  z.string(),
  z.object({
    choice: z.optional(z.string()),
    probabilities: z.optional(z.record(z.string(), z.number())),
  }),
);
type Answers = z.output<typeof answersSchema>;

function choice(answers: Answers, id: string) {
  const choice = answers[id]?.choice;
  if (choice === undefined) {
    throw Error(`Jev did not answer ${id}.`);
  }
  return choice;
}

/** The chosen command, then as many more sliders as the message names changes, by probability. */
function chosen(answers: Answers) {
  const first = choice(answers, "command");
  const count = counts[choice(answers, "count")] ?? 1;
  const others = Object.entries(answers.command?.probabilities ?? {})
    .filter(([id]) => id !== first && id in sliders)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count - 1)
    .map(([id]) => id);
  return [first, ...others];
}

type MaskInput = Extract<Command, { type: "add-mask" }>["mask"];

function areaMask(area: string, size: readonly number[]): MaskInput {
  // Whole source pixels, as a person would place the gradient.
  const [width, height] = size.map(Math.round);
  const at = (share: number, length: number) => Math.round(share * length);
  const middle: [number, number] = [at(0.5, width), at(0.5, height)];
  switch (area) {
    case "top":
      return {
        kind: "linear",
        start: [middle[0], 0],
        end: [middle[0], at(0.55, height)],
      };
    case "bottom":
      return {
        kind: "linear",
        start: [middle[0], height],
        end: [middle[0], at(0.45, height)],
      };
    case "left":
      return {
        kind: "linear",
        start: [0, middle[1]],
        end: [at(0.55, width), middle[1]],
      };
    case "right":
      return {
        kind: "linear",
        start: [width, middle[1]],
        end: [at(0.45, width), middle[1]],
      };
    default:
      return {
        kind: "radial",
        center: middle,
        radius: [at(0.3, width), at(0.35, height)],
        angle: 0,
        feather: 0.5,
      };
  }
}

/** Commands that set the chosen sliders: adjustments in one edit, in a new mask for an area. */
function edit(answers: Answers, photo: Photo, ids: string[]) {
  const area = choice(answers, "area");
  const changes = ids.map((id) => {
    const current = sliders[id].read(photo);
    const value = Number(choice(answers, `value-${id}`));
    return { id, current, value };
  });
  const changed = new Map(changes.map(({ id, value }) => [id, value]));
  const adjustmentChange: Partial<Adjustments> = {};
  for (const [id, { key, read }] of Object.entries(adjustments)) {
    const value = changed.get(id);
    if (value !== undefined) {
      // A mask starts neutral, so it takes the change rather than the value.
      adjustmentChange[key] = area === "photo" ? value : value - read(photo);
    }
  }
  const commands: Command[] = [];
  if (Object.keys(adjustmentChange).length > 0) {
    commands.push(
      area === "photo"
        ? { type: "set-adjustments", ...adjustmentChange }
        : {
            type: "add-mask",
            mask: areaMask(area, photo.sourceSize),
            adjustments: adjustmentChange,
          },
    );
  }
  const vignette = changed.get("vignette");
  if (vignette !== undefined) {
    commands.push({ type: "set-vignette", intensity: vignette });
  }
  const clarity = changed.get("clarity");
  const sharpening = changed.get("sharpening");
  if (clarity !== undefined || sharpening !== undefined) {
    commands.push({ type: "set-details", clarity, sharpening });
  }
  const local = area !== "photo";
  const summary = changes
    .map(({ id, current, value }) => {
      if (local && id in adjustments) {
        const change = round(value - current);
        return `${area} ${id} ${change > 0 ? "+" : ""}${change}`;
      }
      return `${id} ${current} → ${value}`;
    })
    .join(", ");
  return { commands, message: summary };
}

/** Turns Jev's answers into commands and a message for the user. */
export function interpret(
  { photo }: AssistantRequest,
  response: unknown,
): AssistantResponse {
  const answers = answersSchema.parse(response);
  const [first, ...others] = chosen(answers);
  if (first === "reply") {
    return {
      commands: [],
      message: replies[choice(answers, "reply")] ?? replies.unclear,
    };
  }
  const tool = tools[first]?.run(photo);
  const moved = [first, ...others].filter((id) => id in sliders);
  const edits = moved.length > 0 ? edit(answers, photo, moved) : undefined;
  const commands = [...(tool?.commands ?? []), ...(edits?.commands ?? [])];
  const message = [tool?.message, edits?.message].filter(Boolean).join(" · ");
  const editing = commands.some((command) => command.type !== "set-preview");
  // An edit made while the original shows would look like it did nothing.
  if (editing && photo.comparison === "original") {
    commands.unshift({ type: "set-preview", comparison: "edited" });
  }
  return { commands, message: message || replies.unclear };
}
