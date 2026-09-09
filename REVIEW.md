# Code Review

Code should read like a small, complete example from official library documentation: direct, minimal, and understandable at a glance.

Judge simplicity across the complete reading path, including callers and resource lifecycles. Preserve correct behavior, error handling, and cleanup. Repository instructions, documentation, and tests define project-specific rules and verification.

## Responsibilities and placement

- Give each function, component, hook, and file one coherent responsibility.
- Keep functions at one abstraction level. When an operation's mechanics interrupt a higher-level sequence, give it a named function, even with only one caller.
- Decide function boundaries and file placement separately. A helper can stay local, above its consumer. Move general-purpose operations into `lib` for actual or concretely expected reuse, or when an independent capability benefits from its own module.
- Keep a self-contained leaf module together when its name, location, and structure make its purpose clear. Its private implementation steps can differ technically without requiring separate files. Judge size in context; use no arbitrary line limits.
- Keep lower-level modules independent of their application and feature consumers.
- Prefer direct language and library APIs. Add wrappers for a distinct responsibility or a simpler calling interface; avoid forwarding helpers and speculative extension points.
- Share behavior that has the same meaning and should change together. A few repeated lines are preferable to an abstraction combining unrelated concepts.

## Components

- Put generic UI components in `components/ui`, even with one consumer. Keep product-specific UI with its feature. This does not require extracting every native element into a primitive.
- Private components supporting one consumer can live in its file, at module scope and above it. Keep small, clear interactions together until a part needs independent use or obscures the composition. Existing feature folders can make an optional extraction worthwhile.
- Move state and behavior serving a distinct region into the component responsible for that region. Extract the responsibility together; a large hook containing unrelated work is still mixed responsibility.
- Let pages and application components compose capabilities. Keep low-level mechanics outside their rendering code.

## Linear control flow

- Use guard clauses and early returns. Investigate nested decisions for mixed responsibilities, repeated checks, or unnecessary state combinations.
- Allow ternaries only for semantically clear value choices that naturally fit on one line, such as `const label = active ? "Pause" : "Play"`. Never nest them. Revisit the structure behind a multiline ternary instead of mechanically expanding it into `if/else`.
- Avoid ternaries in JSX by default. Calculate values before rendering; use early returns or named components for meaningful conditional regions. A simple boolean `condition && <Element />` is fine for one optional element.
- Keep imperative work, dense boolean chains, immediately invoked functions, and mutable assembly out of JSX.
- Use braces for control flow. Prefer `const`; use `let` for genuine reassignment.

## Data and API contracts

- Model actual needs with the simplest accurate types. Avoid arbitrary extra data, permissive types, casts, and conversion layers introduced merely to make callers fit.
- Make names describe the operation or data they represent, including units when relevant. Calls should be understandable without opening the implementation. Avoid flags that select unrelated behaviors or permit meaningless combinations.
- Use comments for constraints and decisions the code cannot express, rather than narrating implementation.
- Use optional inputs when absence has meaning. Make them required when the work needs them and callers already have them. A local guard can handle legitimate absence; repeated checks for the same dependency suggest resolving availability at its owner. Do not complicate consumers solely to remove optional syntax.
- Represent distinct states explicitly, using a small discriminated union when helpful. Preserve meaningful differences between absence, empty results, loading, and failure. Avoid fallbacks and assertions that conceal broken assumptions.
- Keep one source of truth and derive dependent values.
- Validate external data at its boundary rather than repeatedly checking trusted internal values.
- Design APIs around what they need, own, and produce, with explicit dependencies. Callers should be able to combine behaviors without unnecessary coordination, duplicate resources, or awkward adapters; assess input and output shapes by their effect on composition.
- Give each resource an owner responsible for its lifecycle and cleanup. Accept externally owned resources as dependencies when appropriate. Keep creation inside the module when lifecycle management is part of its responsibility.
- Catch errors to recover, translate, or add useful context; preserve failure information.

## Exceptions

Apply these rules by default. Accept an exception when it provides at least one concrete benefit:

- Better performance supported by measurements or specific work avoided.
- Easier reading of the complete operation and its consumers.
- Fewer lines with equal or better readability.

Explain the rule, benefit, and tradeoff in the review or change description. Clear, cohesive code does not need an exception merely because another organization is possible.

## How to review

1. Read the affected code, callers, and dependencies. Check responsibilities and contracts before individual expressions.
2. For each finding, identify the code, relevant rule, concrete burden, and smallest sound correction. Readability issues count even when behavior is correct; distinguish them from optional reorganization.
3. Evaluate the whole proposed result. Explain what becomes easier to understand, including any new indirection or tradeoff.
4. Run the repository's required checks and report verification gaps.
