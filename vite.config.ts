import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Default base: the app is deployed on Vercel at the domain root,
// so no Pages-style base path is used.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
