import { createGateway } from "ai";
// Vercel runs functions unbundled in Node, so these name their .js output instead of using `@/`.
import { ask, interpret } from "../src/app/assistant/jev.js";
import { assistantRequest } from "../src/app/assistant/protocol.js";

const model = createGateway().evaluationModel("typesafe-ai/jev");

/**
 * Answers an `AssistantRequest` with an `AssistantResponse`. The model and how it is asked stay on
 * the server; the gateway reads `AI_GATEWAY_API_KEY` or Vercel's OIDC token.
 */
export async function POST(request: Request) {
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
}
