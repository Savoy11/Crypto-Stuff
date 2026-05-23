import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background layers
        bg: {
          primary: '#0a0b0e',
          secondary: '#12141a',
          card: '#1a1d26',
          elevated: '#1e2232',
          hover: '#232739',
        },
        // Text
        text: {
          primary: '#e2e8f0',
          secondary: '#94a3b8',
          muted: '#475569',
          inverted: '#0a0b0e',
        },
        // Borders
        border: {
          DEFAULT: '#1e2433',
          subtle: '#161929',
          strong: '#2d3348',
        },
        // Accent
        accent: {
          blue: '#3b82f6',
          'blue-dim': '#1d4ed8',
          'blue-glow': '#60a5fa',
          green: '#10b981',
          'green-dim': '#059669',
          red: '#ef4444',
          'red-dim': '#dc2626',
          amber: '#f59e0b',
          'amber-dim': '#d97706',
          orange: '#f97316',
        },
        // Risk bands
        risk: {
          low: '#10b981',
          'low-bg': 'rgba(16, 185, 129, 0.1)',
          moderate: '#3b82f6',
          'moderate-bg': 'rgba(59, 130, 246, 0.1)',
          elevated: '#f59e0b',
          'elevated-bg': 'rgba(245, 158, 11, 0.1)',
          high: '#f97316',
          'high-bg': 'rgba(249, 115, 22, 0.1)',
          critical: '#ef4444',
          'critical-bg': 'rgba(239, 68, 68, 0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        sidebar: '240px',
        topbar: '56px',
        statusbar: '28px',
      },
      animation: {
        'pulse-critical': 'pulseCritical 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        pulseCritical: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 0 8px rgba(239, 68, 68, 0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'shimmer-gradient': 'linear-gradient(90deg, #1a1d26 25%, #232739 50%, #1a1d26 75%)',
        'card-gradient': 'linear-gradient(135deg, #1a1d26 0%, #1e2232 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #12141a 0%, #0d0f15 100%)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.5)',
        glow: '0 0 20px rgba(59, 130, 246, 0.15)',
        'glow-green': '0 0 20px rgba(16, 185, 129, 0.15)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.15)',
      },
      borderRadius: {
        card: '8px',
      },
    },
  },
  plugins: [],
}

export default config
