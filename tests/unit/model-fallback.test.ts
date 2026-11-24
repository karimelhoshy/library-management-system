import { ApiError } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withModelFallback } from "@/server/ai/client";

describe("withModelFallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("moves on when a model is overloaded", async () => {
    const tried: string[] = [];
    const result = await withModelFallback(
      async (model) => {
        tried.push(model);
        if (model === "a") throw new ApiError({ message: "busy", status: 503 });
        return "answer";
      },
      { models: ["a", "b", "c"] },
    );
    expect(result).toEqual({ value: "answer", model: "b" });
    expect(tried).toEqual(["a", "b"]);
  });

  it("abandons a model that doesn't answer in time", async () => {
    const result = await withModelFallback(
      (model, signal) =>
        model === "silent"
          ? new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
          : Promise.resolve("answer"),
      { models: ["silent", "b"], timeoutMs: 20 },
    );
    expect(result.model).toBe("b");
  });

  it("doesn't retry a request the model rejected", async () => {
    const call = vi.fn(async () => {
      throw new ApiError({ message: "bad request", status: 400 });
    });
    await expect(withModelFallback(call, { models: ["a", "b"] })).rejects.toThrow("bad request");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("pauses and goes round again when every model is busy", async () => {
    let calls = 0;
    const result = await withModelFallback(
      async (model) => {
        calls++;
        if (calls <= 2) throw new ApiError({ message: "busy", status: 503 });
        return model;
      },
      { models: ["a", "b"], pauseMs: 1 },
    );
    expect(result).toEqual({ value: "a", model: "a" });
    expect(calls).toBe(3);
  });

  it("reports the last failure when every model stays down", async () => {
    const call = vi.fn(async () => {
      throw new ApiError({ message: "quota", status: 429 });
    });
    await expect(withModelFallback(call, { models: ["a", "b"], rounds: 2, pauseMs: 1 })).rejects.toMatchObject({ status: 429 });
    expect(call).toHaveBeenCalledTimes(4);
  });
});
