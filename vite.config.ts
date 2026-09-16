import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages project sites serve from a subpath (https://<user>.github.io/<repo>/),
  // not domain root — asset URLs need that prefix or the built bundle 404s and the
  // page renders blank. Override via the BASE_PATH build env var (set it to "/" once
  // you switch to serving from the custom domain's root — see SETUP.md).
  base: process.env.BASE_PATH || '/Custom-Forms/',
})
