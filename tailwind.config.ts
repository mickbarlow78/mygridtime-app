import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        midnight: '#0F1A2E',
        'signal-green': '#00C853',
        'brand-slate': '#1E293B',
        'cool-grey': '#6B7280',
        'light-grey': '#F3F4F6',
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'DejaVu Sans Mono',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
}

export default config
