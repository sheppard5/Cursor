import { defaultOptions, type OptimizeOptions } from "./types";

const KEYS = Object.keys(defaultOptions) as (keyof OptimizeOptions)[];

export function parseOptions(input: unknown): OptimizeOptions {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const options = { ...defaultOptions };
  for (const key of KEYS) {
    if (typeof source[key] === "boolean") options[key] = source[key];
  }
  return options;
}
