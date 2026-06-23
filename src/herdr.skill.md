# herdr — command reference

## Concepts
herdr manages **workspaces** (project contexts) that contain **tabs** that contain **panes** (terminal splits). Each pane runs one agent; they communicate over a local Unix socket. `agent_status` is one of: idle, working, blocked, done, unknown.

IDs look like: workspace `w1`, tab `w1:t1`, pane `w1:p1`. Never assume ids — discover them with `pane list`. Most commands print JSON on success. (`HERDR_ENV=1` is already set for you.)

## Spawn a new agent (split a pane, launch in it)
- `pane split w1:p1 --direction right --no-focus` → returns JSON; the new id is `result.pane.pane_id`
- `pane run w1:p2 "claude"` → launch an agent in that pane
- `wait output w1:p2 --match ">" --timeout 15000` → wait for the agent's prompt

Also: `workspace create --cwd /path [--label "api"] [--no-focus]`, `tab create --workspace w1 [--label "logs"]`.

## Send a task to an existing agent
- `pane run w1:p1 "review the test coverage in src/api/"` → runs the text and presses Enter
- `pane send-text w1:p1 "hello"` → type without Enter
- `pane send-keys w1:p1 Enter` → send keys

## List
- `pane list` → all panes, each with `agent_status` and `focused`
- `workspace list`, `tab list --workspace w1`

## Observe status / output
- `pane read w1:p1 --source recent --lines 50` (or `--source recent-unwrapped`)
- `wait output w1:p3 --match "ready on port 3000" --timeout 30000` (add `--regex` for patterns)
- `wait agent-status w1:p1 --status done --timeout 60000`
- `pane get w1:p1` → details for one pane

The pane you (the orchestrator) speak through is the one with `"focused": true` in `pane list`.
