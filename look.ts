/**
 * `look` — a custom vision tool for opencode.
 *
 * (a) What it does:
 *     Reads a local image file, base64-encodes it, and sends it to a
 *     vision-capable model through an OpenAI-compatible `chat/completions`
 *     endpoint (defaults to a local Ollama server). The model's textual
 *     description of the image is returned to the agent.
 *
 * (b) Deviation from the original "curl" request:
 *     Instead of shelling out to `curl`, this tool uses the native `fetch`
 *     API. Embedding multi-KB base64 payloads into curl argv is fragile
 *     (argument-length limits, quoting/escaping and shell-injection risk),
 *     and `fetch` provides a first-class AbortSignal plus portability across
 *     Bun and Node runtimes.
 *
 * (c) Environment variables:
 *     - LOOK_API_BASE_URL    base URL of the OpenAI-compatible API (required — no default)
 *     - LOOK_API_KEY         bearer token sent as `Authorization: Bearer ...`
 *                            (default: "")
 *     - LOOK_MODEL           vision model name (required — no default)
 *     - LOOK_DEFAULT_PROMPT  prompt used when none is supplied via args/options
 *     - LOOK_MAX_IMAGE_BYTES image size limit in bytes (default: 10485760)
 *     - LOOK_TIMEOUT_MS      request timeout in milliseconds (default: 120000)
 */

import { z } from "zod";
import { isAbsolute, extname, resolve, normalize, join } from "node:path";
import { homedir } from "node:os";
import { readFile, stat } from "node:fs/promises";
import type {
  Plugin,
  PluginInput,
  PluginOptions,
  ToolContext,
  ToolResult,
} from "@opencode-ai/plugin";

const LOOK_DEFAULT_BASE_URL = "";
const LOOK_DEFAULT_MODEL = "";
const LOOK_DEFAULT_PROMPT =
  "Describe this image in detail, including any text, UI elements, or notable visual content.";
const SUPPORTED_EXTS = "png jpg jpeg gif webp bmp svg";

function resolvePositiveInt(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const LOOK_MAX_IMAGE_BYTES = resolvePositiveInt("LOOK_MAX_IMAGE_BYTES", 10 * 1024 * 1024);
const LOOK_TIMEOUT_MS = resolvePositiveInt("LOOK_TIMEOUT_MS", 120000);

type LookArgs = {
  path: string;
  prompt?: string;
  model?: string;
};

interface PathContextLike {
  directory?: string;
  worktree?: string;
}

interface ResolvedConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

type ParseResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Resolve a user-supplied path (absolute, `~`-prefixed, or project-relative). */
function resolvePath(raw: string, ctx?: PathContextLike): string {
  let resolved: string;
  if (isAbsolute(raw)) {
    resolved = raw;
  } else if (raw.startsWith("~")) {
    resolved = join(homedir(), raw.slice(1));
  } else {
    const base = ctx?.directory ?? ctx?.worktree ?? process.cwd();
    resolved = resolve(base, raw);
  }
  return normalize(resolved);
}

/** Map a lowercased file extension to a MIME type, or `undefined`. */
function mimeForExt(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    default:
      return undefined;
  }
}

/** Verify a file's magic bytes match its claimed image MIME type. */
function contentMatchesMime(buf: Buffer, mime: string): boolean {
  switch (mime) {
    case "image/png":
      return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case "image/jpeg":
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/gif":
      return buf.length >= 4 && buf.toString("latin1", 0, 4) === "GIF8";
    case "image/webp":
      return buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP";
    case "image/bmp":
      return buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d;
    case "image/svg+xml": {
      const head = buf.toString("utf8", 0, Math.min(buf.length, 1024)).trimStart();
      return head.startsWith("<svg") || head.startsWith("<?xml");
    }
    default:
      return false;
  }
}

/** Return true if the hostname is a local/loopback address. */
function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "0.0.0.0";
}

/** Extract the hostname from a base URL, or empty string on parse failure. */
function baseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "";
  }
}

/** Return the first non-empty string among the given values. */
function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

function resolveConfig(args: LookArgs, options: PluginOptions): ResolvedConfig {
  return {
    baseUrl:
      firstNonEmpty(options.baseUrl, process.env.LOOK_API_BASE_URL) ??
      LOOK_DEFAULT_BASE_URL,
    apiKey: firstNonEmpty(options.apiKey, process.env.LOOK_API_KEY) ?? "",
    model:
      firstNonEmpty(args.model, options.model, process.env.LOOK_MODEL) ??
      LOOK_DEFAULT_MODEL,
    prompt:
      firstNonEmpty(
        args.prompt,
        options.defaultPrompt,
        process.env.LOOK_DEFAULT_PROMPT,
      ) ?? LOOK_DEFAULT_PROMPT,
  };
}

/** Build the HTTP request target, headers, and JSON body for the API call. */
function buildRequest(
  config: ResolvedConfig,
  dataUrl: string,
): { url: string; headers: Record<string, string>; body: string } {
  const base = config.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey.length > 0) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  const body = JSON.stringify({
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: config.prompt },
        ],
      },
    ],
  });
  return { url: `${base}/chat/completions`, headers, body };
}

/** Extract the model's text from a `content` value that may be a string or array. */
function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as { text?: unknown }).text === "string"
      ) {
        parts.push((item as { text: string }).text);
      }
    }
    return parts.join("").trim();
  }
  return "";
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function hasErrorName(err: unknown, name: string): boolean {
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === name
  ) {
    return true;
  }
  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === name
  ) {
    return true;
  }
  return false;
}

const isAbortError = (err: unknown) => hasErrorName(err, "AbortError");
const isTimeoutError = (err: unknown) => hasErrorName(err, "TimeoutError");

/** Parse the API response into either extracted text or a user-facing error. */
async function parseResponse(res: Response): Promise<ParseResult> {
  if (res.ok) {
    const data: unknown = await res.json();
    const content = (
      data as {
        choices?: Array<{ message?: { content?: unknown } }>;
      }
    )?.choices?.[0]?.message?.content;
    const text = extractText(content);
    if (text === "") {
      return { ok: false, error: "look: model returned no text" };
    }
    return { ok: true, text };
  }

  const raw = await res.text();
  let detail = raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const err = (parsed as { error?: unknown }).error;
      if (err !== undefined && err !== null) {
        if (
          typeof err === "object" &&
          typeof (err as { message?: unknown }).message === "string"
        ) {
          detail = (err as { message: string }).message;
        } else if (typeof err === "string") {
          detail = err;
        } else {
          detail = JSON.stringify(err);
        }
      }
    }
  } catch {
    // Not JSON — fall back to the raw response text.
  }
  return {
    ok: false,
    error: `look: API error ${res.status}: ${truncate(detail)}`,
  };
}

const look = (async (input: PluginInput, options: PluginOptions = {}) => {
  return {
    tool: {
      look: {
        description:
          "Use this tool when the current task requires understanding the visual content of an image, " +
          "such as reading text in a screenshot, describing what a picture shows, or inspecting UI elements. " +
          "Send a local image to a vision model and return its textual description. " +
          "Reads the image file, base64-encodes it, and POSTs it to an OpenAI-compatible " +
          "chat/completions endpoint.",
        args: {
          path: z
            .string()
            .min(1)
            .describe(
              "Path to a local image file (absolute, or relative to the project)",
            ),
          prompt: z
            .string()
            .optional()
            .describe(
              "Optional task for the vision model. Do not blindly copy the user's request. " +
              "First understand what information you need from the image, then formulate a focused visual question for the vision model. " +
              "For search or filtering tasks, ask the vision model to determine whether the image matches the requested criteria and explain the visual evidence. " +
              "For example, instead of passing 'find a WeChat chat list screenshot' verbatim, " +
              "ask 'Does this image show a WeChat chat or conversation list? What visible UI elements indicate this?' " +
              "Omit the prompt when a general image description is sufficient.",
            ),
          model: z.string().optional().describe("Optional model override"),
        },
        async execute(args: LookArgs, context: ToolContext): Promise<ToolResult> {
          try {
            const resolved = resolvePath(args.path, context);

            let info;
            try {
              info = await stat(resolved);
            } catch {
              return `look: file not found: ${resolved}`;
            }

            if (!info.isFile()) {
              return `look: not a file: ${resolved}`;
            }

            if (info.size > LOOK_MAX_IMAGE_BYTES) {
              return `look: image too large (${info.size} bytes, max ${LOOK_MAX_IMAGE_BYTES})`;
            }

            const ext = extname(resolved);
            const mime = mimeForExt(ext);
            if (!mime) {
              return `look: unsupported image type '${ext}'; supported: ${SUPPORTED_EXTS}`;
            }

            const buf = await readFile(resolved);

            if (buf.length > LOOK_MAX_IMAGE_BYTES) {
              return `look: image too large (${buf.length} bytes, max ${LOOK_MAX_IMAGE_BYTES})`;
            }

            if (!contentMatchesMime(buf, mime)) {
              return `look: file content does not match its ${ext} extension (expected ${mime})`;
            }

            const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

            const config = resolveConfig(args, options);
            if (!config.baseUrl) {
              return "look: no API base URL configured; set LOOK_API_BASE_URL (e.g. https://api.openai.com/v1)";
            }
            if (!config.model) {
              return "look: no vision model configured; set LOOK_MODEL (or pass the 'model' argument)";
            }

            const host = baseUrlHost(config.baseUrl);
            if (host && !isLocalHost(host) && typeof context.ask === "function") {
              try {
                await context.ask({
                  permission: "look",
                  patterns: [config.baseUrl],
                  always: [],
                  metadata: { file: resolved },
                });
              } catch {
                return "look: user denied sending this image to a remote endpoint";
              }
            }

            const request = buildRequest(config, dataUrl);

            const signal = AbortSignal.any([context.abort, AbortSignal.timeout(LOOK_TIMEOUT_MS)]);

            let res: Response;
            try {
              res = await fetch(request.url, {
                method: "POST",
                headers: request.headers,
                body: request.body,
                signal,
              });
            } catch (err) {
              if (isTimeoutError(err)) {
                return `look: timed out after ${LOOK_TIMEOUT_MS}ms`;
              }
              if (isAbortError(err)) {
                return "look: aborted";
              }
              const message = err instanceof Error ? err.message : String(err);
              return `look: network error: ${message}`;
            }

            const parsed = await parseResponse(res);
            if (!parsed.ok) return parsed.error;

            return {
              output: parsed.text,
              title: "Look",
              metadata: { model: config.model, mime, bytes: buf.length },
            };
          } catch (err) {
            if (isAbortError(err)) return "look: aborted";
            const message = err instanceof Error ? err.message : String(err);
            return `look: error: ${message}`;
          }
        },
      },
    },
  };
}) satisfies Plugin;

export { look };
export default look;
