<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Crux Test Runner

When running Vitest tests, use `crux` instead of invoking Vitest directly. Use `crux --<command>` when a specific Vitest command or test path is required. Use `crux --full` only when the compact failure output does not contain enough information to diagnose the problem. If raw test-runner output or watch mode is explicitly required, invoke Vitest directly.

# When to use pi-interview vs rpiv-ask-user-question

- Use pi-interview during planning or at the start of a substantial task when multiple requirements, tradeoffs, design choices, visuals, or detailed explanations would help the user make informed decisions and alleviate potential ambiguity and weak specificiations.
- Use rpiv-ask-user-question during implementation for *isolated* clarifications, *quick* choices, or *simple questions* that can be answered directly in the terminal.
- Prefer pi-interview when a question is complex enough that the user may need to ask follow-up or clarifying questions to understand unfamiliar technical concepts before answering.
- Avoid interrupting implementation with a pi-interview for simplistic one-off questions; opt instead for rpiv-ask-user-question.

# Advisor

Use the advisor extension/tool selectively when stronger judgment would materially improve the result: when stuck after reasonable investigation, considering substantially different architectural approaches, encountering unexpected broad consequences, or making a high-impact/security-sensitive decision. Do use the Advisor for routing implementation choices, simple questions, ordinary debugging, or merely for reassurance. Continue as the executor after receiving the advice. Advisor is a second opinion, not a replacement worker.

# Application Building Context

Read the following files in order before implementing or making any architectural decision:

1. `context/project-overview.md` — product definition, goals, features, and scope
2. `context/architecture-context.md` — system structure, boundaries, storage model, and invariants
3. `context/ui-context.md` — theme, colors, typography, canvas design, and component conventions
4. `context/code-standards.md` — implementation rules and conventions
5. `context/ai-workflow-rules.md` — development workflow, scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase, completed work, open questions, and next steps

Update `context/progress-tracker.md` after each meaningful implementation change.

If implementation changes the architecture, scope, or standards documented in the context files, update the relevant file before continuing.
