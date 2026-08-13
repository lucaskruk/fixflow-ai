import { describe, expect, it, vi } from "vitest";
import { LocalComputeCoordinator } from "./local-compute-coordinator";

describe("local compute coordinator", () => {
  it("prevents speech transcription and local AI from running at the same time", () => {
    const coordinator = new LocalComputeCoordinator();
    coordinator.tryAcquire("speech-transcription");

    expect(() => coordinator.tryAcquire("local-ai")).toThrow(
      "No se puede iniciar la tarea de IA local mientras la transcripción de voz está en curso.",
    );
    expect(coordinator.getSnapshot()).toEqual({
      activeTask: "speech-transcription",
    });
  });

  it("returns to idle after the owner releases the task", () => {
    const coordinator = new LocalComputeCoordinator();
    const release = coordinator.tryAcquire("local-ai");

    release();

    expect(coordinator.getSnapshot()).toEqual({ activeTask: null });
    expect(() => coordinator.tryAcquire("speech-transcription")).not.toThrow();
  });

  it("makes releases idempotent and does not let an old owner release a new task", () => {
    const coordinator = new LocalComputeCoordinator();
    const releaseSpeech = coordinator.tryAcquire("speech-transcription");
    releaseSpeech();
    const releaseAI = coordinator.tryAcquire("local-ai");

    releaseSpeech();

    expect(coordinator.getSnapshot()).toEqual({ activeTask: "local-ai" });
    releaseAI();
    releaseAI();
    expect(coordinator.getSnapshot()).toEqual({ activeTask: null });
  });

  it("keeps snapshots stable and notifies subscribers only when state changes", () => {
    const coordinator = new LocalComputeCoordinator();
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);
    const initialSnapshot = coordinator.getSnapshot();

    expect(coordinator.getSnapshot()).toBe(initialSnapshot);

    const release = coordinator.tryAcquire("speech-transcription");
    const activeSnapshot = coordinator.getSnapshot();

    expect(activeSnapshot).not.toBe(initialSnapshot);
    expect(coordinator.getSnapshot()).toBe(activeSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => coordinator.tryAcquire("local-ai")).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    release();
    expect(coordinator.getSnapshot()).toBe(initialSnapshot);
    expect(listener).toHaveBeenCalledTimes(2);

    release();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    const releaseAI = coordinator.tryAcquire("local-ai");
    releaseAI();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
