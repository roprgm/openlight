import { createGateway } from "ai";
import { ask, interpret } from "../src/app/assistant/jev.js";
import { assistantRequest } from "../src/app/assistant/protocol.js";

/**
 * Answers a POST of an `AssistantRequest` with an `AssistantResponse`. The model and how it is
 * asked stay on the server; without `apiKey`, the gateway reads `AI_GATEWAY_API_KEY` or Vercel's
 * OIDC token.
 */
export function createAssistantHandler({ apiKey }: { apiKey?: string } = {}) {
  const model = createGateway({ apiKey }).evaluationModel("typesafe-ai/jev");
  return async (request: Request) => {
    if (request.method !== "POST") {
      return Response.json({ error: "Use POST." }, { status: 405 });
    }
    const body = assistantRequest.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!body.success) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const { state, questions } = ask(body.data);
    // A stalled model would otherwise hold the chat until the function times out.
    const abortSignal = AbortSignal.timeout(15_000);
    // The model directly: the SDK's evaluate rejects answers whose top options tie.
    const evaluate = async () =>
      model.doEvaluate({ state, questions, abortSignal });
    try {
      const { answers } = await evaluate().catch(evaluate);
      return Response.json(interpret(body.data, answers));
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: "The assistant is unavailable right now." },
        { status: 502 },
      );
    }
  };
}

export const POST = createAssistantHandler();
