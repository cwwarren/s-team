# s-team

A generative voice control plane for [herdr](https://github.com/ogulcancelik/herdr):
you talk to a **Chief of Staff** agent and it delegates work to herdr panes and
briefs you back.

> ⚠️ **Very early WIP.** A personal project, moving fast and breaking things —
> the schema, APIs, and audio internals change without notice, it's macOS-only
> right now, and it may not run on your machine. Not stable, not supported, no
> guarantees.

## Setup

```bash
brew install portaudio   # native audio backend (macOS)
bun install
cp .env.example .env      # add your OPENAI_API_KEY
```

## Run

```bash
bun start
```

Talk to it — hands-free (semantic VAD), it responds in voice and delegates to
herdr. The first run prompts for microphone access.

See [docs/vision.md](docs/vision.md) for where this is headed.
