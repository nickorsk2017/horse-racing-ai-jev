import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const port = Number(env.PORT) || 3000;

  return {
    plugins: [react()],
    server: { port, strictPort: false },
    preview: { port, strictPort: false },
  };
});
