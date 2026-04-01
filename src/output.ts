import chalk from "chalk";
import { ExitCode, CliError } from "./utils.js";

export type OutputFormat = "human" | "json";

let _format: OutputFormat | null = null;

export function getOutputFormat(): OutputFormat {
  if (_format) return _format;
  // Auto-detect: JSON when stdout is not a TTY
  if (process.argv.includes("--output")) {
    const idx = process.argv.indexOf("--output");
    const val = process.argv[idx + 1];
    if (val === "json") return (_format = "json");
    if (val === "human") return (_format = "human");
  }
  return (_format = process.stdout.isTTY ? "human" : "json");
}

export function isJsonOutput(): boolean {
  return getOutputFormat() === "json";
}

export interface Envelope {
  status: "ok" | "error";
  data?: any;
  error?: { code: string; message: string };
  metadata?: Record<string, any>;
}

export function outputSuccess(data: any, metadata?: Record<string, any>): void {
  if (isJsonOutput()) {
    const envelope: Envelope = { status: "ok", data, metadata: metadata || {} };
    console.log(JSON.stringify(envelope, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ));
  }
}

export function outputError(code: string, message: string, exitCode: ExitCode = ExitCode.GENERAL_ERROR, metadata?: Record<string, any>): never {
  if (isJsonOutput()) {
    const envelope: Envelope = { status: "error", error: { code, message }, metadata: metadata || {} };
    console.log(JSON.stringify(envelope, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ));
    process.exit(exitCode);
  }
  console.error(chalk.red(message));
  process.exit(exitCode);
}

export function handleErrorJson(err: any): never {
  const exitCode = err instanceof CliError ? err.exitCode : ExitCode.GENERAL_ERROR;
  const code = err instanceof CliError ? ExitCode[err.exitCode] : "GENERAL_ERROR";
  if (isJsonOutput()) {
    outputError(code, err.message || String(err), exitCode);
  }
  console.error(chalk.red(err.message || String(err)));
  process.exit(exitCode);
}

/** Log to stdout in human mode (suppressed in JSON mode) */
export function humanLog(msg: string): void {
  if (!isJsonOutput()) {
    console.log(msg);
  }
}

/** Log to stdout in human mode, stderr in JSON mode (for progress messages) */
export function statusLog(msg: string): void {
  if (!isJsonOutput()) {
    console.log(msg);
  } else {
    process.stderr.write(msg + "\n");
  }
}
