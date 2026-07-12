import { describe, expect, it } from "vitest";
import {
  isProviderHttpErrorStatus,
  isRetryableProviderHttpStatus,
  toHttpStatusCode
} from "../src/providers/provider-errors.js";

describe("provider error classification", () => {
  it("distinguishes retryable provider responses", () => {
    expect(isRetryableProviderHttpStatus(429)).toBe(true);
    expect(isRetryableProviderHttpStatus(503)).toBe(true);
    expect(isRetryableProviderHttpStatus(400)).toBe(false);
  });

  it("accepts only valid HTTP error status values", () => {
    expect(isProviderHttpErrorStatus(401)).toBe(true);
    expect(isProviderHttpErrorStatus(200)).toBe(false);
    expect(toHttpStatusCode("502")).toBe(502);
    expect(toHttpStatusCode(99)).toBeUndefined();
  });
});
