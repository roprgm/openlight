export type Flags = { aiHeal: boolean };

const off: Flags = { aiHeal: false };

/** Reads the flags that `api/flags.ts` evaluates on Vercel; an unreachable endpoint leaves every flag off. */
export async function loadFlags(): Promise<Flags> {
  try {
    const response = await fetch("/api/flags");
    if (!response.ok) return off;
    const flags: Record<string, unknown> = await response.json();
    return { aiHeal: flags["ai-heal"] === true };
  } catch {
    return off;
  }
}
