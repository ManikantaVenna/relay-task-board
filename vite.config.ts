import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { env } from "node:process";
export default defineConfig({
  plugins: [react()],
  base: env.DEPLOY_BASE_PATH || "/",
});
