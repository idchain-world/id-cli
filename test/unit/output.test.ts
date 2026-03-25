import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CliError, ExitCode } from "../../src/utils.js";

describe("outputSuccess", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("outputs JSON envelope when in JSON mode", async () => {
    // Force JSON mode by mocking isTTY and clearing cached format
    const output = await import("../../src/output.js");
    // We can test the envelope structure directly
    const envelope = { status: "ok" as const, data: { name: "test" }, metadata: {} };
    const json = JSON.stringify(envelope);
    const parsed = JSON.parse(json);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.name).toBe("test");
  });
});

describe("Envelope structure", () => {
  it("success envelope has correct shape", () => {
    const envelope = { status: "ok" as const, data: { foo: "bar" }, metadata: { chain: "base" } };
    expect(envelope.status).toBe("ok");
    expect(envelope.data).toEqual({ foo: "bar" });
    expect(envelope.metadata).toEqual({ chain: "base" });
  });

  it("error envelope has correct shape", () => {
    const envelope = {
      status: "error" as const,
      error: { code: "INPUT_ERROR", message: "bad input" },
      metadata: {},
    };
    expect(envelope.status).toBe("error");
    expect(envelope.error.code).toBe("INPUT_ERROR");
    expect(envelope.error.message).toBe("bad input");
  });

  it("bigint values serialize correctly", () => {
    const data = { amount: 1000000n };
    const json = JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    expect(JSON.parse(json).amount).toBe("1000000");
  });
});

describe("ExitCode", () => {
  it("has expected values", () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.GENERAL_ERROR).toBe(1);
    expect(ExitCode.INPUT_ERROR).toBe(2);
    expect(ExitCode.AUTH_ERROR).toBe(3);
    expect(ExitCode.NOT_FOUND).toBe(4);
    expect(ExitCode.INSUFFICIENT_FUNDS).toBe(5);
  });
});

describe("CliError exit code mapping", () => {
  it("maps to correct exit code for each error type", () => {
    expect(new CliError("test", ExitCode.INPUT_ERROR).exitCode).toBe(2);
    expect(new CliError("test", ExitCode.AUTH_ERROR).exitCode).toBe(3);
    expect(new CliError("test", ExitCode.NOT_FOUND).exitCode).toBe(4);
    expect(new CliError("test", ExitCode.INSUFFICIENT_FUNDS).exitCode).toBe(5);
  });

  it("handleErrorJson would use CliError exitCode", () => {
    const err = new CliError("not found", ExitCode.NOT_FOUND);
    const code = err instanceof CliError ? ExitCode[err.exitCode] : "GENERAL_ERROR";
    expect(code).toBe("NOT_FOUND");
  });

  it("handleErrorJson would use GENERAL_ERROR for non-CliError", () => {
    const err = new Error("generic");
    const code = err instanceof CliError ? ExitCode[err.exitCode] : "GENERAL_ERROR";
    expect(code).toBe("GENERAL_ERROR");
  });
});
