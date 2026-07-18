/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        bg: {
          primary: '#0a0b0e',
          secondary: '#12141a',
          card: '#1a1d26',
          elevated: '#1e2232',
          hover: '#232739',
        },
        text: {
          primary: '#e2e8f0',
          secondary: '#94a3b8',
          muted: '#475569',
          inverted: '#0a0b0e',
        },
        border: {
          DEFAULT: '#1e2433',
          subtle: '#161926',
          strong: '#2d3347',
        },
        accent: {
          blue: '#3b82f6',
          green: '#10b981',
          red: '#ef4444',
          amber: '#f59e0b',
          orange: '#f97316',
          purple: '#8b5cf6',
        },
        risk: {
          low: '#10b981',
          moderate: '#3b82f6',
          elevated: '#f59e0b',
          high: '#f97316',
          critical: '#ef4444',
        },
      },
      spacing: {
        sidebar: '240px',
        topbar: '56px',
        statusbar: '28px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '0.75rem',
        badge: '0.25rem',
      },
      backgroundImage: {
        'sidebar-gradient': 'linear-gradient(180deg, #12141a 0%, #0d0f15 100%)',
      },
    },
  },
  plugins: [],
}
