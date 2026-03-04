import { defineConfig }  from 'vite'
import glsl              from 'vite-plugin-glsl'
import htmlPartials      from './vite-plugin-html-partials.js'

export default defineConfig({
  base: './',   // relative paths so GH Pages serves assets correctly
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir:    'dist',
    emptyOutDir: true,
    sourcemap: false
  },
  plugins: [
    glsl(),           // enables: import shader from './shaders/vert.glsl'
    htmlPartials(),   // enables: <!-- include:toolbar --> in index.html
  ]
})