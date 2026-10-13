import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rolldownOptions: {
      input: { popup: resolve(import.meta.dirname, 'popup.html') }
    }
  }
})