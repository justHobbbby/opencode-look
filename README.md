# Look 👁️

### Give your OpenCode agent eyes — delegate visual perception to the model that does it best.

`look` is a lightweight visual perception tool for [OpenCode](https://opencode.ai/).

It lets a text-first AI agent inspect images when the current task requires visual information. Instead of requiring the main agent to be a vision-capable model, `look` delegates image understanding to a configurable vision model and returns the result to the agent.

```text
                 ┌─────────────────┐
                 │   Main Agent 🧠 │
                 │  reasoning/code │
                 └────────┬────────┘
                          │
                 needs visual information?
                          │
                          ▼
                    ┌───────────┐
                    │  Look 👁️  │
                    └─────┬─────┘
                          │
                    Vision Model
                          │
                          ▼
                     Image Input
```

## Why Look?

A single model does not need to be good at everything.

Strong reasoning and coding models are not always the best vision models, while vision-specialized models may not be the best choice for complex reasoning or coding.

`look` treats visual perception as an **agent capability** rather than a requirement of the main model.

The agent decides when visual information is necessary, then delegates that perception task to the model configured for it.

> **Look doesn't decide when to see. The agent does.**

## Features

- 👁️ Visual perception for text-first OpenCode agents
- 🤖 Use any OpenAI-compatible vision model
- 🏠 Works with local models such as Ollama
- ☁️ Supports remote vision APIs
- 🎯 Model can be overridden per call
- 💬 Custom prompts per call
- 📦 Base64 `data:` URL image input
- 🛑 Respects OpenCode tool cancellation via `AbortSignal`
- 🔒 Configurable image size limit
- 🧩 Single-file OpenCode plugin

## Installation

1. Copy `look.ts` into your OpenCode plugin directory:

   ```text
   .opencode/
   └── plugins/
       └── look.ts
   ```

   Files in `.opencode/plugins/` are loaded automatically at startup.

2. Add `zod` to `.opencode/package.json` (OpenCode runs `bun install` at startup to install dependencies):

   ```json
   {
     "dependencies": {
       "zod": "^4.1.8"
     }
   }
   ```

3. Set the required environment variables (see [Configuration](#configuration)). For example, a local Ollama setup:

   ```bash
   export LOOK_API_BASE_URL="http://localhost:11434/v1"
   export LOOK_MODEL="qwen2.5vl:7b"
   ```

4. Restart OpenCode — fully quit and relaunch. Opening a new session is not enough; plugins are loaded at startup only.

The `look` tool will then be available to the agent.

## Usage

The agent can call:

```text
look(path: "screenshots/login.png")
```

Or provide a specific instruction:

```text
look(
  path: "screenshots/login.png",
  prompt: "What error message is shown in this screenshot?"
)
```

You can also override the vision model for an individual call:

```text
look(
  path: "screenshots/login.png",
  model: "your-vision-model"
)
```

### When should the agent use Look?

`look` is intended to be used when the current task requires information that can only be obtained by inspecting image content.

Examples:

- Reading text from screenshots
- Understanding error messages shown in images
- Inspecting UI layouts
- Understanding diagrams or visualizations
- Describing objects or visual content
- Extracting information that exists only inside an image

It should **not** be called merely because an image exists. If the image is irrelevant to completing the current task, the agent should continue without using `look`.

## Configuration

Configuration is controlled through environment variables.

| Variable | Description | Default |
|---|---|---|
| `LOOK_API_BASE_URL` | OpenAI-compatible API base URL | *(required — no default)* |
| `LOOK_API_KEY` | Bearer token for the API | Empty |
| `LOOK_MODEL` | Vision model | *(required — no default)* |
| `LOOK_DEFAULT_PROMPT` | Default image analysis prompt | See below |
| `LOOK_MAX_IMAGE_BYTES` | Maximum image size in bytes | `10485760` (10 MiB) |
| `LOOK_TIMEOUT_MS` | Request timeout in milliseconds | `120000` (2 min) |

`LOOK_API_BASE_URL` and `LOOK_MODEL` have **no default** and must be set before use. The tool returns a clear error if either is missing.

Default prompt:

```text
Describe this image in detail, including any text, UI elements, or notable visual content.
```

### Example: Local Ollama

Point `look` at a local Ollama server with a vision model:

```bash
export LOOK_API_BASE_URL="http://localhost:11434/v1"
export LOOK_MODEL="qwen2.5vl:7b"
```

No API key is required for a local Ollama server.

### Remote OpenAI-compatible API

Any compatible endpoint can be used:

```bash
export LOOK_API_BASE_URL="https://api.example.com/v1"
export LOOK_API_KEY="your-api-key"
export LOOK_MODEL="vision-model-name"
```

No code changes are required when switching providers.

## Privacy

Images are read from your local disk and sent — Base64-encoded — to the endpoint configured in `LOOK_API_BASE_URL`.

- With a **local** endpoint (e.g. `http://localhost:11434/v1`), images never leave your machine.
- With a **remote** endpoint, the image (and any text or UI it contains) is transmitted to that server. Do not send sensitive screenshots, design drafts, or documents to a remote API unless you trust the endpoint.

For remote endpoints, `look` requests a confirmation before sending each image.

## Supported Images

Supported file types (the tool verifies a file's magic bytes against its extension):

- PNG
- JPG / JPEG
- GIF
- WebP
- BMP
- SVG

Whether a given format is actually accepted depends on the vision model's API. PNG, JPEG, WebP, and GIF are widely supported by OpenAI-compatible vision endpoints; BMP and SVG are only accepted by some providers. Check your provider's capabilities.

The default maximum image size is **10 MiB**.

Override it with:

```bash
export LOOK_MAX_IMAGE_BYTES=20971520
```

## How It Works

1. The agent determines that the current task requires visual information.
2. `look` resolves the local image path.
3. The image is read from disk.
4. The image is encoded as Base64 and converted into a `data:` URL.
5. The image and prompt are sent to an OpenAI-compatible `/chat/completions` endpoint.
6. The vision model analyzes the image.
7. The textual result is returned to the main agent.
8. The main agent continues reasoning with the visual observation.

The HTTP request uses the native `fetch` API rather than shelling out to `curl`.

This avoids passing large Base64 payloads through shell arguments and allows the request to participate in OpenCode's cancellation mechanism.

## Example: Local Vision Model

Look can also be used with a local vision model through Ollama.

For example, I tested:

* **Agent:** OpenCode + Big Pickle
* **Vision model:** Qwen2.5-VL-7B via Ollama
* **GPU:** RTX 4060 Laptop GPU
* **Cost:** essentially just the electricity used by the local machine

With this setup, the agent can use `look` for visual perception while the main agent remains responsible for reasoning and task execution.

For example:

> "In `~/Pictures/Screenshots`, find a screenshot of a WeChat chat window."

The agent can inspect candidate images with the vision model, identify the matching screenshot, and continue the task based on what it sees.

This is only one possible setup. The vision model can be local or remote; any compatible OpenAI-style vision endpoint can be used.

## Design Philosophy

`look` is intentionally small.

It does not attempt to make the main model multimodal, replace the main agent, or perform reasoning on behalf of the agent.

Instead:

```text
Main Agent
    │
    ├── Reasoning
    ├── Planning
    ├── Coding
    └── Tool orchestration
              │
              ▼
          Look 👁️
              │
              ▼
        Vision Model
              │
              ▼
         Observation
              │
              └──────────► Main Agent
```

The main agent remains responsible for reasoning. The vision model is responsible for visual perception.

> **Give each model the job it does best.**

## Requirements

- OpenCode
- A vision-capable model
- An OpenAI-compatible `/chat/completions` endpoint
- Node.js-compatible runtime support

No default endpoint or model is configured — set `LOOK_API_BASE_URL` and `LOOK_MODEL` before use.

## Verification

The tool has been tested against Ollama with a vision-capable model.

The verified happy path successfully extracted text from a generated PNG image, and error handling has been verified for:

- Missing files
- Non-file paths
- Unsupported image types
- Oversized images
- Network errors
- API errors
- Request cancellation

## Disclaimer

This project is an independent community project and is **not affiliated with, endorsed by, or sponsored by the OpenCode team**.