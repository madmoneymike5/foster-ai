# Development Workflow

## Branch and Merge Flow

- All implementation commits land directly on `development`. No feature branches for routine work.
- `main` is integration-only: it advances solely via `development → main` pull requests. No one commits or pushes to `main` directly.
- Also enforced locally by a `pre-commit` / `pre-merge-commit` guard in the primary checkout's `.git/hooks/` (symlinked into the development worktree's gitdir hooks dir; the global tokensave hooks chain to it). It refuses commits while on `main`; emergency override: `ALLOW_MAIN_COMMIT=1 git commit ...`.
- Enforced by the GitHub ruleset **"Protect main"** (ruleset id 25978006, `~DEFAULT_BRANCH`): `pull_request` rule with `required_approving_review_count: 0` (PR required, no approval needed — solo dev, local CodeRabbit is the review gate; required count 1 would deadlock since GitHub forbids author self-approval), `non_fast_forward` (no force pushes), `deletion` (branch cannot be deleted). Verified 2026-10-27: direct push rejected, scratch PR merged-CLEAN with zero approvals. Note: this repo's 2026-generation ruleset API needs `conditions.ref_name.include/exclude` (`target_id` is ignored — an empty condition set matches nothing) and `required_review_thread_resolution` is a required param.
- Sarah runs CodeRabbit locally in VSC on `development` and fixes findings there before creating the PR.
- The day-to-day workspace for `development` is the permanent linked worktree at `/home/sarah-taylor/Dev/worktrees/foster-ai--f5ed78e5/development`. The primary checkout stays on `main` for inspection, fetch, and branch administration only.
- Ordinary pushes only. If history ever needs rewriting, use `--force-with-lease` — never bare `--force`.

## Approach

Build this project incrementally using a spec-driven workflow. Context files define what to build, how to build it, and what the current state of progress is. Always implement against these specs — do not infer or invent behavior from scratch.

## Scoping Rules

- Work on one feature unit or subsystem at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.

## When To Split Work

Split an implementation step if it combines:

- UI changes and background task changes
- Real-time canvas state and database persistence
- Multiple unrelated API routes
- Behavior that is not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing.

## Protected Foundation Components

Do not modify generated third-party foundation components unless explicitly instructed.

This includes:

- `components/ui/*` (shadcn/ui components)
- third-party library internals

These should remain default and reusable.

Project-specific styling, layout changes, and feature logic must be implemented in app-level components instead of modifying foundation components.

Only modify these files when a task explicitly requires it.

## Keeping Docs In Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope

Progress state must reflect the actual state of the implementation, not the intended state.

## Before Moving To The Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture-context.md` was violated.
3. `progress-tracker.md` reflects the completed work.
