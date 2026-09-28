import { expect, test } from "bun:test";
import { ask, interpret } from "@/app/assistant/jev";
import type { AssistantRequest } from "@/app/assistant/protocol";

const request: AssistantRequest = {
  message: "warmer and darker",
  earlier: [],
  photo: {
    adjustments: {
      exposure: 0.5,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      incrementalTemperature: 0,
      incrementalTint: 0,
      vibrance: 0,
      saturation: 0,
    },
    vignette: 0,
    clarity: 0,
    sharpening: 0,
    toneCurve: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    comparison: "edited",
    sourceSize: [300, 200],
  },
};

/** Answers as Jev returns them: a choice per question, with the command's distribution. */
function answers(
  command: Record<string, number>,
  choices: Record<string, string>,
) {
  const [first] = Object.entries(command).sort((a, b) => b[1] - a[1]);
  return {
    command: { type: "choice", choice: first[0], probabilities: command },
    ...Object.fromEntries(
      Object.entries(choices).map(([id, choice]) => [
        id,
        { type: "choice", choice },
      ]),
    ),
  };
}

test("the assistant asks one question per decision and turns the answers into commands", () => {
  const { state, questions } = ask(request);
  expect(state.current.exposure).toBe(0.5);
  expect(Object.keys(questions)).toContain("value-temperature");
  expect(questions.command).toMatchObject({
    type: "choice",
    criteria: { reset: expect.any(String), reply: expect.any(String) },
  });

  expect(
    interpret(
      request,
      answers(
        { temperature: 0.6, reply: 0.2, exposure: 0.15, vignette: 0.05 },
        {
          count: "two",
          area: "photo",
          "value-temperature": "30.0",
          "value-exposure": "-1.0",
        },
      ),
    ),
  ).toEqual({
    commands: [
      { type: "set-adjustments", exposure: -1, incrementalTemperature: 30 },
    ],
    message: "temperature 0 → 30, exposure 0.5 → -1",
  });

  const sky = interpret(
    { ...request, photo: { ...request.photo, comparison: "original" } },
    answers(
      { exposure: 0.9, vignette: 0.1 },
      { count: "one", area: "top", "value-exposure": "-0.5" },
    ),
  );
  expect(sky.commands).toEqual([
    { type: "set-preview", comparison: "edited" },
    {
      type: "add-mask",
      mask: { kind: "linear", start: [150, 0], end: [150, 110] },
      adjustments: { exposure: -1 },
    },
  ]);
  expect(sky.message).toBe("top exposure -1");

  const inverted = {
    ...request,
    photo: {
      ...request.photo,
      toneCurve: [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ],
    },
  };
  expect(interpret(inverted, answers({ invert: 1 }, { count: "one" }))).toEqual(
    {
      commands: [{ type: "set-tone-curve" }],
      message: "Colors restored",
    },
  );

  expect(
    interpret(
      request,
      answers(
        { reply: 0.9, exposure: 0.1 },
        { count: "one", reply: "greeting" },
      ),
    ),
  ).toEqual({
    commands: [],
    message:
      "Hi! I can edit this photo for you. Try “make it warmer” or “darken the sky”.",
  });
});
