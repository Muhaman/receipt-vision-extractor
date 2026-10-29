import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ZodError } from "zod";
import { LlmInvalidOutputError, LlmRefusalError, LlmTruncatedError, LlmUpstreamError } from "../errors.js";
import type { AllowedMime } from "./mime.js";
import { type Receipt, ReceiptSchema } from "./schema.js";

export interface ReceiptFile {
  buffer: Buffer;
  mimeType: AllowedMime;
}

export interface Extractor {
  extract(file: ReceiptFile): Promise<Receipt>;
}

const SYSTEM_PROMPT =
  "You extract structured data from a single receipt, supplied as an image or PDF. " +
  "Transcribe amounts exactly as printed and do not infer values that are not visible. " +
  "Use the ISO 4217 currency code, a YYYY-MM-DD date, and pick the single best category. " +
  "If a subtotal is not printed, use the sum of the line items.";

const MAX_TOKENS = 16_000;

/**
 * `parse` validates and JSON-decodes the output itself, so a malformed or truncated
 * answer throws before `stop_reason` can be read. Every such failure is the model's
 * or the provider's fault, never the client's.
 */
function toModelError(err: unknown): never {
  if (err instanceof Anthropic.APIError) throw new LlmUpstreamError();
  if (err instanceof ZodError || err instanceof SyntaxError) throw new LlmInvalidOutputError();
  throw err;
}

export class ClaudeExtractor implements Extractor {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async extract(file: ReceiptFile): Promise<Receipt> {
    const data = file.buffer.toString("base64");
    const media =
      file.mimeType === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
        : ({ type: "image", source: { type: "base64", media_type: file.mimeType, data } } as const);

    const response = await this.client.beta.messages
      .parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content: [media, { type: "text", text: "Extract this receipt." }] }],
      })
      .catch(toModelError);

    if (response.stop_reason === "refusal") throw new LlmRefusalError(response.stop_details?.category);
    if (response.stop_reason === "max_tokens") throw new LlmTruncatedError();
    if (!response.parsed_output) throw new LlmInvalidOutputError();
    return response.parsed_output;
  }
}
