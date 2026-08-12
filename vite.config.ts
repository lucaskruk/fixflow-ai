import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const WINDOWS_MOUNT_PREFIX = "/mnt/c/";

function readPollingOverride(): boolean | null {
  const value = process.env.FIXFLOW_VITE_POLLING?.trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(
    "FIXFLOW_VITE_POLLING debe ser 1/true/on o 0/false/off.",
  );
}

function isWindowsMountedWorkspace(cwd: string): boolean {
  return cwd === "/mnt/c" || cwd.startsWith(WINDOWS_MOUNT_PREFIX);
}

export default defineConfig(({ command }) => {
  const pollingOverride = readPollingOverride();
  const usePolling =
    command === "serve" &&
    (pollingOverride ?? isWindowsMountedWorkspace(process.cwd()));

  return {
    plugins: [react(), cloudflare()],
    ...(usePolling
      ? {
          server: {
            watch: {
              usePolling: true,
              interval: 750,
            },
          },
        }
      : {}),
  };
});
