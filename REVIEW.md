# Code review

Use [AGENTS.md](AGENTS.md) for architecture and coding rules. Review the complete path from user action through edits, processing, and resource cleanup. Code should be a small, readable example of how the application works.

## Review questions

- **Ownership:** Does each module have one responsibility? Does feature behavior stay with its feature? Is shared code independent of its consumers? `lib/` must meet the layer-0 definition, not merely have multiple callers.
- **Simplicity:** Does the whole change justify its code, including tests, helpers, scripts, and documentation? Could direct functions or a few repeated lines replace configuration, forwarding layers, or speculative extension points?
- **State and boundaries:** Is each fact stored once? Are inputs and dependencies explicit, invalid states represented clearly, and external data validated at its boundary? Do errors retain enough context to fix them?
- **Behavior and lifetime:** Do edits, grouping, cancellation, and undo work together? Can asynchronous work outlive or overwrite its document? Does each owner release resources, subscriptions, and pending work correctly?
- **Tests:** Would a short, representative workflow fail if the changed behavior broke? Do extra cases protect distinct risks? Follow the [testing guidance](AGENTS.md#tests-and-completion).
- **Evidence:** Can reviewers assess every new or changed UI from actual screenshots with the affected controls visible? Rendered output does not replace UI screenshots. Does the PR include [rendering measurements](PERFORMANCE.md) when GPU work changes? Check reported limitations as well as passing results.

## Findings and tradeoffs

For each finding, name the affected code, the concrete problem or reading burden, and the smallest useful correction. Distinguish necessary changes from optional reorganization. Do not split cohesive code solely to reduce line counts.

Accept a departure from a coding guideline when it demonstrably improves readability, reduces total complexity, or improves performance with evidence. Explain the tradeoff in the PR. Ordinary implementation choices do not require an approval ceremony.

Report required checks and remaining verification gaps. An image supplements tests; a performance claim needs measurements of the affected workload.
