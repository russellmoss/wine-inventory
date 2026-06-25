import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws when imported outside an RSC build; stub it so
      // pure logic in server-only modules can be unit-tested under node.
      "server-only": fileURLToPath(new URL("./test/stub-server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
