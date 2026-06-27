import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/evoscript-simulator/', // ⚠️ Change 'evoscript-simulator' to match your exact GitHub repository name!
})