# AI Planning Session

## Core
Read this first. Read Extended only for coding-heavy, multi-step, or ambiguous work.

- Keep context small
- Clear context between unrelated tasks
- If 2 corrections fail, restart with a better prompt
- Ask max 1 clarifying question
- Make the smallest useful change
- Verify before finishing
- For long sessions, compact and preserve only: goal, decisions, modified files, errors, next steps

## Extended
Read only when task is coding-heavy, multi-step, or unclear.

### Workflow
Goal → Constraints → Explore → Plan → Implement → Verify → Summarize

### Planning mode
Before acting, answer briefly:
- Goal:
- Constraints:
- Files/tools needed:
- Verification:
- Planning required? (yes/no)

If task is small and clear, skip planning and execute.

### Prompt style
- Reference exact files, commands, errors, outputs
- Prefer diffs over full files
- Reuse existing patterns before creating new ones
- Keep explanations short unless requested

### Compaction
When session gets long, preserve only:
- Current goal
- Decisions made
- Modified files
- Failing tests/errors
- Next steps

### Avoid
- Mixing unrelated tasks in one session
- Repeating failed attempts in same context
- Long background explanations
- Reading unnecessary files
- Expanding investigation without clear value

### Reset triggers
Reset or compact when:
- Context becomes noisy
- Task changes substantially
- Repeated corrections are happening
- Investigation expands without clear value

### Large tasks
Use subagents, separate context, or a fresh session for large investigations.
