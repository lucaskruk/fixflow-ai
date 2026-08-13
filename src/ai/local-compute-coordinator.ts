import { useSyncExternalStore } from "react";

export type LocalComputeTask = "speech-transcription" | "local-ai";

export type LocalComputeSnapshot = Readonly<{
  activeTask: LocalComputeTask | null;
}>;

type Listener = () => void;

const IDLE_SNAPSHOT: LocalComputeSnapshot = Object.freeze({ activeTask: null });

function taskLabel(task: LocalComputeTask): string {
  return task === "speech-transcription"
    ? "la transcripción de voz"
    : "la tarea de IA local";
}

export class LocalComputeCoordinator {
  private readonly listeners = new Set<Listener>();
  private ownerToken: symbol | null = null;
  private snapshot: LocalComputeSnapshot = IDLE_SNAPSHOT;

  readonly getSnapshot = (): LocalComputeSnapshot => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  tryAcquire(task: LocalComputeTask): () => void {
    const activeTask = this.snapshot.activeTask;
    if (activeTask !== null) {
      throw new Error(
        `No se puede iniciar ${taskLabel(task)} mientras ${taskLabel(activeTask)} está en curso.`,
      );
    }

    const ownerToken = Symbol(task);
    this.ownerToken = ownerToken;
    this.setSnapshot(Object.freeze({ activeTask: task }));

    let released = false;
    return () => {
      if (released) return;
      released = true;

      if (this.ownerToken !== ownerToken) return;

      this.ownerToken = null;
      this.setSnapshot(IDLE_SNAPSHOT);
    };
  }

  private setSnapshot(snapshot: LocalComputeSnapshot): void {
    if (this.snapshot === snapshot) return;

    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

export const localComputeCoordinator = new LocalComputeCoordinator();

export function useLocalComputeStatus(): LocalComputeSnapshot {
  return useSyncExternalStore(
    localComputeCoordinator.subscribe,
    localComputeCoordinator.getSnapshot,
    localComputeCoordinator.getSnapshot,
  );
}
