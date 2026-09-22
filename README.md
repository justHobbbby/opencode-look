# Look

Give OpenCode a replaceable pair of eyes — send one image to any vision model, get back text.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)
![OpenCode plugin](https://img.shields.io/badge/OpenCode-plugin-6f42c1.svg)

https://github.com/user-attachments/assets/d1b57d30-3c76-4119-966b-90c6d2fbee5f

## TL;DR

- **What it is.** A single-file [OpenCode](https://opencode.ai/) plugin that adds an explicit `look` tool: the agent sends one local image and a focused question to a configurable vision model and receives only a text observation.
- **Why it is decoupled.** Image bytes stay out of the main agent context, and the vision model is chosen independently of the primary agent — local or remote, overridable per call.
- **How it composes.** `look` is a small primitive. The agent produces the image it needs (extract video keyframes, render a PDF page, capture a screenshot) and uses `look` as its visual channel.

## Quick start

1. Copy `look.ts` into `.opencode/plugins/`.

   ```text
   .opencode/
   └── plugins/
       └── look.ts
   ```

2. Add `zod` to `.opencode/package.json`:

   ```json
   {
     "dependencies": {
       "zod": "4.1.8"
     }
   }
   ```
   
   OpenCode runs `bun install` at startup.

3. Set `LOOK_API_BASE_URL` and `LOOK_MODEL`.

   Local Ollama example:

   ```bash
   export LOOK_API_BASE_URL="http://localhost:11434/v1"
   export LOOK_MODEL="qwen2.5vl:7b"
   ```

   Remote OpenAI-compatible example:

   ```bash
   export LOOK_API_BASE_URL="https://api.deepseek.com"
   export LOOK_API_KEY="your-api-key"
   export LOOK_MODEL="deepseek-v4-flash-vision-exp"
   ```

4. Fully quit and relaunch OpenCode. Plugins are loaded at startup.

## What agents do with it

The primary agent decides *when* to look and *what* to ask. That makes a compact set of visual tasks practical:

- Watch a screen recording: extract keyframes with `ffmpeg`, then inspect them with `look` to write a UI bug report.
- Read a screenshot, diagram, chart, or database schema that exists only as an image.
- Verify how something actually renders before or after a change.
- Pick the right image among many by asking `look` whether each candidate matches the criteria.
- Extract text or UI details the surrounding text does not contain.

## How it works

```text
Brain: Primary Agent
  reason, plan, decide when to look
  continue from the returned observation

Eyes: Look
  send local image + focused question
  return text observation

Hands: Read / Write
  inspect and change the project
```

`look` reads a local image, Base64-encodes it into a `data:` URL, and POSTs it to the configured OpenAI-compatible `/chat/completions` endpoint. The text from the first response choice is returned to the primary agent. The request uses native `fetch`.

It is an agent-controlled visual perception channel — not an automatic image interceptor, OCR pipeline, model catalog, or replacement for a native multimodal model. The primary agent controls two decisions: when to look, and what visual question to ask.

Because the model is decoupled, the primary agent does not need vision support. The vision model can be local or remote, can be overridden per call, and any combination works: local-to-local, local-to-online, online-to-local, online-to-online.

### Usage

Basic call:

```text
look(path: "screenshots/login.png")
```

Ask a focused question:

```text
look(
  path: "screenshots/login.png",
  prompt: "What error message is shown in this screenshot?"
)
```

The prompt is the agent's focused visual subtask, not a copy of the user's request.

### Don't skip referenced images

Text-only agents often skip past images embedded in pages, documents, or API responses, treating them as decorative placeholders even when they carry information the text does not. `look` treats referenced images as potential information sources: when an image's visual content matters to the task, the agent should obtain it and inspect it with `look` instead of skipping it.

## With and without `look`

**Prompt:** find the desk-setup photo among a folder of screenshots and answer — *which is on the left, the laptop or the monitor?* and *is the laptop on a stand?*

**Target image:**

<img width="1695" height="978" alt="Screenshot From 2026-09-05 21-07-54" src="https://github.com/user-attachments/assets/f3fade50-823b-4dad-b817-f6175b4181e7" />

### Without `look`

<img width="2202" height="778" alt="Screenshot From 2026-09-06 01-17-07" src="https://github.com/user-attachments/assets/d798d768-1236-4464-8ed7-125f458ffc14" />

*(the agent cannot see the image and admits it)*

### With `look`

<img width="2202" height="737" alt="Screenshot From 2026-09-06 01-17-01" src="https://github.com/user-attachments/assets/280274c5-515d-4837-bb9f-ebd22aa434e4" />

*(the agent inspects it with `look` and answers correctly)*

## Composing with other tools

Look is a small primitive: it inspects one local image. It is meant to be composed with other tools, so the primary agent decides when visual information is needed and how to produce the image.

A user can merely mention that a screen recording exists:

```text
There's a screen recording of mine in recordings/.
```

The plugin has no video support, but the agent can locate the file, extract keyframes with `ffmpeg`, and inspect the resulting images with `look` to understand what happens in the recording. The same pattern applies to other formats: render PDF pages or export frames from a design file to images, then inspect them.

This is not a built-in feature and not magic. Look adds no video, PDF, or OCR handling; the capability emerges from the agent orchestrating existing tools and using `look` as its visual channel.

## Configuration

| Variable | Description | Default |
|---|---|---|
| `LOOK_API_BASE_URL` | OpenAI-compatible API base URL | required, no default |
| `LOOK_API_KEY` | Bearer token for the API | empty |
| `LOOK_MODEL` | Vision model | required, no default |
| `LOOK_DEFAULT_PROMPT` | Prompt used when none is supplied | see below |
| `LOOK_MAX_IMAGE_BYTES` | Maximum image size in bytes | `10485760` (10 MiB) |
| `LOOK_TIMEOUT_MS` | Request timeout in milliseconds | `120000` (2 min) |

Default prompt:

```text
Describe this image in detail, including any text, UI elements, or notable visual content.
```

## Privacy & permissions

- `look` reads a local image file and does not persist it itself.
- The file bytes are Base64-encoded into a `data:` URL and posted to `LOOK_API_BASE_URL`.
- For a loopback endpoint such as `localhost`, Look sends the image only to that local endpoint.
- For a remote host, the image and prompt are sent to that endpoint. For the default agent this happens immediately and silently, with no prompt; some built-in subagents deny tool use, in which case `look` simply does not run.
- Do not send sensitive screenshots, private documents, or design drafts to a remote API unless you trust the endpoint. The full image bytes leave your machine and reach that third party; there is no redaction.

### Optional: require confirmation

Confirmation is opt-in and off by default. To be asked before each remote send, add the custom `look` permission to `opencode.json`:

```json
{
  "permission": {
    "look": "ask"
  }
}
```

Per-endpoint control is also valid:

```json
{
  "permission": {
    "look": {
      "*": "ask",
      "https://api.deepseek.com": "allow"
    }
  }
}
```

Entries are matched in order, so later entries take precedence: keep `"https://api.deepseek.com": "allow"` after `"*": "ask"`, or the broader `ask` silently wins. The endpoint key is matched literally against the configured `LOOK_API_BASE_URL`, including any trailing slash or `/v1` path, so copy it verbatim from `LOOK_API_BASE_URL` or the rule will not match.

The prompt offers once / always / reject. Choosing "always" suppresses further prompts for that endpoint until OpenCode is restarted — it is session-scoped, not persistent. Setting `"look": "deny"` blocks remote sends entirely. Loopback endpoints such as `localhost` do not trigger a prompt.

This relies on OpenCode's permission handling. With no `look` rule configured, OpenCode's default `*: allow` catch-all makes the permission check pass silently, so no prompt appears; setting `"look": "ask"` is what makes it appear.

## Supported images

Look accepts these local file extensions and verifies each file's magic bytes before sending:

- PNG
- JPG / JPEG
- GIF
- WebP
- BMP
- SVG

Downstream API support can be narrower. PNG, JPEG, WebP, and GIF are widely supported by OpenAI-compatible vision endpoints; BMP and SVG are provider-dependent.

## Requirements & verification

Requirements:

- OpenCode
- A vision-capable model
- An OpenAI-compatible `/chat/completions` endpoint
- An OpenCode-compatible plugin runtime

Tested against local Ollama and online vision endpoints, covering screenshot search, focused visual prompts, text and UI extraction, post-change verification, and error handling (missing files, invalid paths, unsupported formats, oversized images, network/API errors, cancellation).

## FAQ

**Does `look` read videos?**
No. The plugin has no video support. The agent can extract keyframes with `ffmpeg` and inspect the resulting images with `look` — that capability is composed, not built in.

**Does the plugin store my images?**
No. It reads the file, Base64-encodes it for the request, and does not persist it itself.

**Are images sent to a third party by default?**
Yes, when `LOOK_API_BASE_URL` points at a remote host, the full image bytes are sent silently with no prompt. Point it at a loopback endpoint such as `localhost` to keep everything local, or opt in to prompting (see [Privacy & permissions](#privacy--permissions)).

**Which models work?**
Any OpenAI-compatible vision endpoint that accepts `/chat/completions` with `image_url` content — local or remote.

**Does it work with local models?**
Yes. A local Ollama endpoint is a supported and tested configuration.

**Does the primary agent need vision support?**
No. That is the point of the split: the main agent stays text-only and delegates perception to the configured vision model.

## Disclaimer

This project is an independent community project and is not affiliated with, endorsed by, or sponsored by the OpenCode team.

## License

MIT
