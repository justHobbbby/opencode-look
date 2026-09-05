# Look

Give OpenCode a replaceable pair of eyes without putting images in its working memory.

`look` is a single-file [OpenCode](https://opencode.ai/) plugin that adds an explicit `look` tool. The primary agent decides when visual information is needed, sends a local image and a focused question to a configurable vision model, and receives only the textual observation.

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

## What it is and is not

Look is an agent-controlled visual perception channel, not an automatic image interceptor, OCR pipeline, model catalog, or replacement for a native multimodal model.

The primary agent controls two decisions:

- when to look
- what visual question to ask

## Why use it?

Direct multimodal input is useful, but it also puts image data and visual noise into the main agent context.

Look keeps image understanding out of the main context and decouples model selection:

- the primary agent does not need vision support
- the vision model can be local or remote
- the model can be overridden per call
- local-to-local, local-to-online, online-to-local, and online-to-online combinations are possible

## Don't miss relevant visual information

Text-only agents often skip past images embedded in pages, documents, or API responses, treating them as decorative placeholders even when they carry information the text does not. Look treats referenced images as potential information sources: when an image's visual content matters to the task, the agent should obtain it and inspect it with Look instead of skipping it.

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

## Usage

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

## Privacy

- `look` reads a local image file and does not persist it itself.
- The file bytes are Base64-encoded into a `data:` URL and posted to `LOOK_API_BASE_URL`.
- For a loopback endpoint such as `localhost`, Look sends the image only to that local endpoint.
- For a remote host, the image and prompt are sent to that endpoint. The plugin requests permission through OpenCode before sending when `context.ask` is available.
- Do not send sensitive screenshots, private documents, or design drafts to a remote API unless you trust the endpoint.

## Supported images

Look accepts these local file extensions and verifies each file's magic bytes before sending:

- PNG
- JPG / JPEG
- GIF
- WebP
- BMP
- SVG

Downstream API support can be narrower. PNG, JPEG, WebP, and GIF are widely supported by OpenAI-compatible vision endpoints; BMP and SVG are provider-dependent.

## How it works

`look` reads a local image, Base64-encodes it, and sends it to the configured OpenAI-compatible `/chat/completions` endpoint. The text from the first response choice is returned to the primary agent. The request uses native `fetch`.

## Requirements and verification

Requirements:

- OpenCode
- A vision-capable model
- An OpenAI-compatible `/chat/completions` endpoint
- An OpenCode-compatible plugin runtime

Tested against local Ollama and online vision endpoints, covering screenshot search, focused visual prompts, text and UI extraction, post-change verification, and error handling (missing files, invalid paths, unsupported formats, oversized images, network/API errors, cancellation).

## Disclaimer

This project is an independent community project and is not affiliated with, endorsed by, or sponsored by the OpenCode team.

## License

MIT
