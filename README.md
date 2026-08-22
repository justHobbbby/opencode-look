# Look

Give OpenCode eyes without putting images in its working memory.

`look` is a single-file [OpenCode](https://opencode.ai/) plugin that gives the agent a dedicated visual-perception channel. The main agent stays responsible for reasoning, planning, and acting. A separate vision model is responsible for seeing.

```text
+----------------------------------------------------------+
| OpenCode agent                                            |
|                                                          |
| Brain: Primary Agent                                      |
|   reasoning, planning, tool orchestration, code changes   |
|                                                          |
| Hands: Read / Write                                       |
|   read project files, edit files, verify results          |
|                                                          |
| Eyes: Look                                                |
|   select an image and ask a focused question              |
|        |                                                  |
|        v                                                  |
|   vision model (local or remote)                          |
|        |                                                  |
|        v                                                  |
|   text observation returned to the brain                  |
+----------------------------------------------------------+
```

## Why a separate visual channel?

Multimodal models can see, but attaching every relevant image directly to the main agent creates a different problem.

- An image consumes context and token budget as soon as it enters the main conversation.
- Large or repeated screenshots can crowd out code, tool output, and task state from the agent's working memory.
- Visual noise can make a long coding or planning task harder to follow.
- Choosing a multimodal main model ties visual quality to reasoning quality, even when those jobs benefit from different models.

`look` treats perception as an out-of-band step.

The image is sent in a separate request to the vision model. The vision model returns a text observation. The plugin returns only that textual observation to the primary agent; it does not return the image payload. The main agent continues with a compact textual description or answer.

This makes visual perception cheaper to run, easier to replace, and easier to reason about.

> `look` does not decide when the agent should see. The primary agent decides, then delegates the looking.

## What it is good for

`look` is useful when the agent needs information that exists only inside an image.

- Reading text or error messages from screenshots
- Inspecting UI layout, broken states, or visual regressions
- Finding a specific image among many screenshots
- Understanding diagrams, flowcharts, or visualizations
- Extracting data from scanned pages, receipts, or labels
- Describing what a picture or design mockup shows
- Verifying that a UI change produced the expected result

It should not be called merely because an image exists. The agent should call it when the visual observation can change the next action.

## Brain, eyes, and hands

The value of `look` is clearest inside a working loop.

```text
1. The primary agent decides that visual information is needed.
2. Look sends the image and a focused question to a vision model.
3. The vision model returns a text observation.
4. The primary agent interprets that observation.
5. Read / Write performs the next action in the project.
6. The primary agent may call Look again to verify the result.
```

Example:

```text
User: "The login page is rendering incorrectly. Inspect it."

Brain: the agent opens the app or reads the existing code.
Eyes: look(path: "screenshots/login.png",
          prompt: "Describe the visible layout and any broken UI elements.")

Brain: the agent connects the visual report to the relevant component.
Hands: Read opens the component, Write applies a fix.
Eyes: look(path: "screenshots/login-fixed.png",
          prompt: "Does the login form now look correctly aligned?")

Brain: the agent confirms the fix or continues debugging.
```

This is more than "text models can now see images." It is an agent with a replaceable sense of sight that feeds observations back into a deliberate action loop.

## Local or remote, your choice

`look` does not require a local model, and it does not require an online model.

Both routes use the same interface: an OpenAI-compatible `chat/completions` endpoint.

### Local vision model

Use a local vision model when you want images to stay on your machine, have no per-image API cost, or work offline.

```bash
export LOOK_API_BASE_URL="http://localhost:11434/v1"
export LOOK_MODEL="qwen2.5vl:7b"
```

No `LOOK_API_KEY` is required for a local Ollama server.

One real local setup that has been tested uses OpenCode with Big Pickle as the primary agent, Qwen2.5-VL-7B via Ollama as the vision model, and an RTX 4060 Laptop GPU. In that setup, the agent searched a screenshot directory, used `look` to inspect candidates, identified the matching image, and then called `look` again with a focused prompt for deeper UI analysis. No per-request API cost was involved; the ongoing cost was local compute and electricity.

This is one tested configuration, not a requirement. Any compatible local vision model can be used.

### Remote vision model

Use a remote OpenAI-compatible vision API when you want stronger visual recognition, lower local resource usage, or already use an online provider.

```bash
export LOOK_API_BASE_URL="https://api.example.com/v1"
export LOOK_API_KEY="your-api-key"
export LOOK_MODEL="your-vision-model"
```

Replace `api.example.com` with your provider's compatible base URL.

Common combinations include:

- Online main agent + local vision model: keep main reasoning strong while keeping images local.
- Local main agent + online vision model: use the online model only for focused perception.
- Local main agent + local vision model: keep the whole loop local.
- Online main agent + online vision model: use best-of-breed models while keeping image understanding out of the main context.

### Tested online setup

One online setup tested during development used DeepSeek Pro as the OpenCode primary agent and Kimi K2.5 as the vision model behind `look`.

Configure the primary model in OpenCode separately. For `look`:

```bash
export LOOK_API_BASE_URL="https://api.moonshot.ai/v1"
export LOOK_API_KEY="your-moonshot-api-key"
export LOOK_MODEL="kimi-k2.5"
```

This uses the international Moonshot endpoint. Model IDs and base URLs are provider-specific; use the values from your provider's API documentation.

## Installation

1. Copy `look.ts` into your OpenCode plugin directory:

   ```text
   .opencode/
   └── plugins/
       └── look.ts
   ```

   Files in `.opencode/plugins/` are loaded automatically at startup.

2. Add `zod` to `.opencode/package.json`:

   ```json
   {
     "dependencies": {
       "zod": "^4.1.8"
     }
   }
   ```

   OpenCode runs `bun install` at startup to install dependencies.

3. Set `LOOK_API_BASE_URL` and `LOOK_MODEL`.

4. Fully quit and relaunch OpenCode. Opening a new session is not enough; plugins are loaded at startup.

The `look` tool will then be available to the agent.

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

Override the vision model for a single call:

```text
look(
  path: "screenshots/login.png",
  model: "your-vision-model"
)
```

### Writing good prompts

The prompt should describe what the main agent needs to learn, not repeat the user's broad request.

For search or filtering:

```text
prompt: "Does this image show a WeChat chat or conversation list? What visible UI elements indicate this?"
```

For debugging:

```text
prompt: "Return only the visible error message and any relevant UI context. Do not describe the whole page."
```

For verification:

```text
prompt: "Has the button moved, changed size, or changed alignment compared with a normal layout?"
```

This keeps the returned observation compact and useful.

## Configuration

Configuration is controlled through environment variables.

| Variable | Description | Default |
|---|---|---|
| `LOOK_API_BASE_URL` | OpenAI-compatible API base URL | required, no default |
| `LOOK_API_KEY` | Bearer token for the API | empty |
| `LOOK_MODEL` | Vision model | required, no default |
| `LOOK_DEFAULT_PROMPT` | Prompt used when none is supplied | see below |
| `LOOK_MAX_IMAGE_BYTES` | Maximum image size in bytes | `10485760` (10 MiB) |
| `LOOK_TIMEOUT_MS` | Request timeout in milliseconds | `120000` (2 min) |

`LOOK_API_BASE_URL` and `LOOK_MODEL` have no default and must be set before use. The tool returns a clear error if either is missing.

Default prompt:

```text
Describe this image in detail, including any text, UI elements, or notable visual content.
```

## Privacy

Images are read from the local disk and sent, Base64-encoded, to the endpoint configured in `LOOK_API_BASE_URL`.

- With a local endpoint, images do not leave your machine.
- With a remote endpoint, the image and any visible text are transmitted to that server. Do not send sensitive screenshots, design drafts, or private documents to a remote API unless you trust the endpoint.

For remote endpoints, `look` asks for confirmation before sending each image.

## Supported images

The tool verifies a file's magic bytes against its extension.

- PNG
- JPG / JPEG
- GIF
- WebP
- BMP
- SVG

PNG, JPEG, WebP, and GIF are widely supported by OpenAI-compatible vision endpoints. BMP and SVG are supported by some providers only. Check your provider's capabilities.

The default maximum image size is 10 MiB.

Override it with:

```bash
export LOOK_MAX_IMAGE_BYTES=20971520
```

## How it works

1. The primary agent determines that the current task requires visual information.
2. `look` resolves the local image path.
3. The image is read from disk.
4. The image is encoded as Base64 and converted into a `data:` URL.
5. The image and prompt are sent to an OpenAI-compatible `/chat/completions` endpoint.
6. The vision model analyzes the image.
7. The textual result is returned to the primary agent.
8. The primary agent continues reasoning with the visual observation.

The HTTP request uses native `fetch` instead of shelling out to `curl`.

This avoids passing large Base64 payloads through shell arguments and allows the request to participate in OpenCode's cancellation mechanism.

## Design philosophy

`look` is intentionally small.

It does not replace the primary agent, make the main model multimodal, or perform reasoning on behalf of the agent.

It gives OpenCode a reusable visual sense.

```text
Brain: Primary Agent
  decide, plan, reason, orchestrate tools

Eyes: Look
  send image + focused question
  receive text observation

Hands: Read / Write
  inspect and change the project
```

The primary agent remains responsible for reasoning. The vision model is responsible for visual perception. The file tools are responsible for action.

> Give each part of the loop the job it does best.

## Requirements

- OpenCode
- A vision-capable model
- An OpenAI-compatible `/chat/completions` endpoint
- A Node.js-compatible runtime

No default endpoint or model is configured. Set `LOOK_API_BASE_URL` and `LOOK_MODEL` before use.

## Verification

The tool has been exercised with local and remote OpenAI-compatible vision models, including a local Ollama setup and an online DeepSeek Pro + Kimi K2.5 setup. Manual verification has covered:

- Searching a screenshot directory and inspecting candidate images
- Reading text and UI elements from screenshots
- Using focused visual prompts for search, debugging, and verification
- Selecting the matching image from multiple candidates based on the returned observations
- Extracting text from a generated PNG image

Error handling has been verified for:

- Missing files
- Non-file paths
- Unsupported image types
- Oversized images
- Network errors
- API errors
- Request cancellation

## Disclaimer

This project is an independent community project and is not affiliated with, endorsed by, or sponsored by the OpenCode team.
