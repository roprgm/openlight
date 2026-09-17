# Code review

Use [AGENTS.md](AGENTS.md) for architecture and coding rules. Review the complete path from user action through edits, processing, and resource cleanup. Code should be a small, readable example of how the application works.

## Review questions

- **Ownership:** Does each module have one responsibility? Does feature behavior stay with its feature? Is shared code independent of its consumers? `lib/` must meet the layer-0 definition, not merely have multiple callers.
- **Simplicity:** Does an abstraction reduce the work of understanding callers and lifecycles? Could a direct function or a few repeated lines be clearer? Avoid extra configuration, forwarding layers, and speculative extension points.
- **State and boundaries:** Is each fact stored once? Are inputs and dependencies explicit, invalid states represented clearly, and external data validated at its boundary? Do errors retain enough context to fix them?
- **Behavior and lifetime:** Do edits, grouping, cancellation, and undo work together? Can asynchronous work outlive or overwrite its document? Does each owner release resources, subscriptions, and pending work correctly?
- **Evidence:** Do tests check actual behavior and pixels where relevant? Does the PR show the result and include [rendering measurements](PERFORMANCE.md) when GPU work changes? Check reported limitations as well as passing results.

## Findings and tradeoffs

For each finding, name the affected code, the concrete problem or reading burden, and the smallest useful correction. Distinguish necessary changes from optional reorganization. Do not split cohesive code solely to reduce line counts.

Accept a departure from a coding guideline when it demonstrably improves readability, reduces total complexity, or improves performance with evidence. Explain the tradeoff in the PR. Ordinary implementation choices do not require an approval ceremony.

Report required checks and remaining verification gaps. An image supplements tests; a performance claim needs measurements of the affected workload.
