# s-team — a generative voice control plane for herdr

## The bet

The human↔AI interface is converging on a single end-to-end multimodal model:
`video+audio+text → video+audio+text`, and eventually a direct brain–computer
interface. That is the bitter lesson applied to interaction itself — hand-built
UI affordances lose to a model that learns the interface directly.

Until that model ships, the highest-leverage thing we can do is **research the
interaction** and **widen the bandwidth** between a human and a fleet of agents.
s-team is that research vehicle. It is intentionally a stepping stone, not a
destination.

## What it is

s-team is a **Chief of Staff** you talk to. You have a natural spoken
conversation; it does almost nothing itself except **delegate work** to new or
existing [herdr](https://github.com/ogulcancelik/herdr) agent sessions and brief
you on what they are doing. The conversation is later augmented by a **fully
generative TUI** (OpenTUI) that the agent drives as a visual channel — graphs,
plans you can hover and refine, live sketching — never a fixed interface.

## Control plane vs data plane

- **s-team = control plane.** The conversational surface (voice now, generative
  TUI next). It holds *no* long-running work. It listens, talks, decides, and
  delegates. If s-team crashes, no work is lost.
- **herdr = data plane.** Where work actually happens: workspaces → tabs → panes,
  each pane a running coding agent. s-team's "tools" are thin wrappers over the
  `herdr` CLI (`pane split` / `pane run` / `pane read` / `wait agent-status`).

```
  you ⇄ (voice) ⇄ s-team ⇄ (gpt-realtime-2) ── tool calls ──▶ herdr CLI ──▶ panes (agents)
                    │                                                          │
                    └──────────────── spoken brief ◀── pane output ◀──────────┘
```

## Principles

- **Minimal and direct.** Start with the simplest architecture and few features;
  iterate as real needs appear. Do not pre-build for imagined requirements.
- **Swappable seams.** The realtime model, the audio backend, and the herdr
  transport are each isolated behind one small module, so each can be replaced
  without touching the rest.
- **The model drives.** The agent decides what to say, what to delegate, and
  (later) what to render. We give it good tools and a good prompt, not a
  hard-coded flow.

## v0 — voice loop (current target)

A clean spoken conversation in the terminal, with real delegation. No TUI yet.

1. Native mic → PCM16 @ 24 kHz mono → `gpt-realtime-2` over WebSocket (semantic
   VAD, barge-in).
2. Model speech → native speaker; transcripts streamed to the terminal.
3. Model calls herdr tools (`delegate_task`, `list_agents`, `read_agent_output`)
   → s-team shells out to `herdr` → returns result → model speaks a summary.

**Done when:** I can hold a natural spoken conversation with the cos, have it
spin up / message a herdr pane and report back, verified live.

### Key decisions

| Decision | Choice | Why |
|---|---|---|
| Model | `gpt-realtime-2` | Reasoning effort, reliable tool use, 128k context |
| Transport | raw WebSocket (`ws`) | Transparent; full control of audio + tool dispatch |
| Audio | native PortAudio bindings | Lower latency than shelling out; user preference |
| Turn-taking | `semantic_vad` + barge-in | Hands-free, natural conversation |
| herdr seam | `herdr` CLI wrapper | The data-plane interface herdr already exposes |
| Prompt | authored from OpenAI's realtime prompting skeleton | Solid, model-aligned base |

### Known risks

- **Native audio under Bun** (N-API / FFI compatibility) — the primary unknown.
  Fallback path: `bun:ffi` directly to `libportaudio`, then `sox` as last resort.
- **24 kHz device capture** — if the device won't open at 24 kHz, capture at
  48 kHz and resample 2:1 (clean integer ratio).
- gpt-realtime-2 latency/cost over WS with native audio.

## Roadmap (each step earns the next)

1. **v0 — voice loop** (above).
2. **Generative TUI.** Model emits declarative UI specs via render tools; the
   host reconciles them into OpenTUI. Mouse hover/click feed back as events.
3. **Interactive artifacts.** Hover a plan node → ask for detail/changes →
   reflected live. Live sketch + annotate while talking.
4. **Richer data plane.** Multi-agent orchestration, status dashboards, the cos
   proactively surfacing what needs attention.
