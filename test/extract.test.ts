import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { LlmInvalidOutputError, LlmRefusalError, LlmTruncatedError, LlmUpstreamError } from "../src/errors.js";
import { ClaudeExtractor } from "../src/receipt/extract.js";
import { sampleReceipt, PNG_BYTES } from "./helpers.js";

type Outcome = { stop_reason: string; stop_details?: { category: string } | null; parsed_output?: unknown };

function stubExtractor(result: Outcome | Error) {
  const parse = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return { stop_details: null, parsed_output: null, ...result };
  });
  const client = { beta: { messages: { parse } } } as unknown as Anthropic;
  return { extractor: new ClaudeExtractor(client, "claude-opus-5-5"), parse };
}

const png = { buffer: PNG_BYTES, mimeType: "image/png" } as const;

function sentContent(parse: ReturnType<typeof stubExtractor>["parse"]) {
  const params = parse.mock.calls[0] as unknown as [{ messages: { content: Array<Record<string, unknown>> }[] }];
  return params[0].messages[0]?.content[0];
}

describe("ClaudeExtractor", () => {
  it("returns the parsed receipt on end_turn", async () => {
    const receipt = sampleReceipt();
    const { extractor } = stubExtractor({ stop_reason: "end_turn", parsed_output: receipt });
    await expect(extractor.extract(png)).resolves.toEqual(receipt);
  });

  it("sends an image block with the media type for PNG input", async () => {
    const { extractor, parse } = stubExtractor({ stop_reason: "end_turn", parsed_output: sampleReceipt() });
    await extractor.extract(png);
    expect(sentContent(parse)).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: PNG_BYTES.toString("base64") },
    });
  });

  it("sends a document block for PDF input", async () => {
    const { extractor, parse } = stubExtractor({ stop_reason: "end_turn", parsed_output: sampleReceipt() });
    const buffer = Buffer.from("%PDF-1.4 synthetic");
    await extractor.extract({ buffer, mimeType: "application/pdf" });
    expect(sentContent(parse)).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
    });
  });

  it("throws LlmRefusalError on a refusal", async () => {
    const { extractor } = stubExtractor({ stop_reason: "refusal", stop_details: { category: "general_harms" } });
    await expect(extractor.extract(png)).rejects.toBeInstanceOf(LlmRefusalError);
  });

  it("throws LlmTruncatedError on max_tokens", async () => {
    const { extractor } = stubExtractor({ stop_reason: "max_tokens" });
    await expect(extractor.extract(png)).rejects.toBeInstanceOf(LlmTruncatedError);
  });

  it("throws LlmInvalidOutputError when nothing was parsed", async () => {
    const { extractor } = stubExtractor({ stop_reason: "end_turn", parsed_output: null });
    await expect(extractor.extract(png)).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });

  it("maps a SyntaxError from parse to LlmInvalidOutputError", async () => {
    const { extractor } = stubExtractor(new SyntaxError("Unexpected end of JSON input"));
    await expect(extractor.extract(png)).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });

  it("maps a ZodError from parse to LlmInvalidOutputError", async () => {
    const zodError = new ZodError(z.string().safeParse(1).error?.issues ?? []);
    const { extractor } = stubExtractor(zodError);
    await expect(extractor.extract(png)).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });

  it("maps an Anthropic APIError to LlmUpstreamError", async () => {
    const apiError = Anthropic.APIError.generate(529, { error: { message: "overloaded" } }, "overloaded", new Headers());
    const { extractor } = stubExtractor(apiError);
    await expect(extractor.extract(png)).rejects.toBeInstanceOf(LlmUpstreamError);
  });
});
