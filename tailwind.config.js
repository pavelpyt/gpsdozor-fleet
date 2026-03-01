/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        void: {
          DEFAULT: '#050505',
          50: '#0a0a0a',
          100: '#111111',
          200: '#1a1a1a',
          300: '#222222',
          400: '#333333',
          500: '#555555',
          600: '#777777',
          700: '#999999',
          800: '#cccccc',
          900: '#e5e5e5',
          950: '#f5f5f5',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['Satoshi', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-xs': '0 0 8px rgba(255,255,255,0.06)',
        'glow-sm': '0 0 15px rgba(255,255,255,0.08)',
        'glow': '0 0 25px rgba(255,255,255,0.1)',
        'glow-md': '0 0 35px rgba(255,255,255,0.12)',
        'glow-lg': '0 0 50px rgba(255,255,255,0.15)',
        'glow-accent': '0 0 30px rgba(255,255,255,0.2)',
        'glow-green': '0 0 20px rgba(180,255,180,0.15)',
        'glow-red': '0 0 20px rgba(255,140,140,0.15)',
        'glow-amber': '0 0 20px rgba(255,220,140,0.12)',
        'inner-glow': 'inset 0 0 20px rgba(255,255,255,0.04)',
      },
      animation: {
        'rise': 'rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade': 'fade 0.4s ease-out both',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255,255,255,0.06)' },
          '50%': { boxShadow: '0 0 30px rgba(255,255,255,0.12)' },
        },
      },
    },
  },
  plugins: [],
}
