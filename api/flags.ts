import { createClient } from "@vercel/flags-core";

// A deployment authenticates with the project's OIDC token; `vercel env pull` provides it for local development.
const client = createClient();

/** The feature flags the editor composes at startup, evaluated where the Vercel credentials live. */
export async function GET() {
  const aiHeal = await client
    .evaluate<boolean>("ai-heal", false)
    .then((result) => result.value)
    .catch(() => false);
  return Response.json(
    { "ai-heal": aiHeal },
    { headers: { "cache-control": "no-store" } },
  );
}
