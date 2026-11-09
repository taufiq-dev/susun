import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: {
      alias: shared
    }
  },
  preload: {
    resolve: {
      alias: shared
    }
  },
  renderer: {
    resolve: {
      alias: {
        ...shared,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      // `import X from './file.svg?react'` makes an SVG a component (the logo, in Logo.tsx). Its
      // slate, #263740, becomes currentColor, so CSS colours it. svgo drops the file's <title> and
      // <desc> (an inline SVG's <title> shows as a tooltip) and prefixes its ids with the file's
      // name, so two SVGs on one page can't take each other's.
      svgr({
        svgrOptions: {
          plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
          dimensions: false,
          replaceAttrValues: { '#263740': 'currentColor' },
          svgoConfig: {
            plugins: [
              {
                name: 'preset-default',
                params: { overrides: { removeViewBox: false, removeDesc: { removeAny: true } } }
              },
              'prefixIds'
            ]
          }
        }
      })
    ]
  }
})
