import { expect, test } from "bun:test";
import { ask, interpret } from "@/app/assistant/jev";
import type { AssistantRequest } from "@/app/assistant/protocol";
import { defaultAdjustments } from "@/features/adjustments/model";
import { defaultCurve } from "@/features/tone-curves/curve";

const request: AssistantRequest = {
  message: "warmer and darker",
  earlier: [],
  photo: {
    adjustments: { ...defaultAdjustments, exposure: 0.5 },
    vignette: 0,
    clarity: 0,
    sharpening: 0,
    toneCurve: [...defaultCurve],
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

  const toneCurve = defaultCurve.map(({ x, y }) => ({ x, y: 1 - y }));
  const inverted = { ...request, photo: { ...request.photo, toneCurve } };
  const reset = interpret(inverted, answers({ invert: 1 }, { count: "one" }));
  expect(reset.commands).toEqual([{ type: "set-tone-curve" }]);
  expect(reset.message).toBe("Colors restored");

  const greeting = interpret(
    request,
    answers({ reply: 0.9, exposure: 0.1 }, { count: "one", reply: "greeting" }),
  );
  expect(greeting.commands).toEqual([]);
  expect(greeting.message).toStartWith("Hi! I can edit this photo for you.");
});
