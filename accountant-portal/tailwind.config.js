/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#050508',
          secondary: '#0a0a12',
          tertiary: '#0d0d1a',
          card: 'rgba(255,255,255,0.03)',
        },
        accent: {
          cyan: '#00d4ff',
          purple: '#8b5cf6',
          emerald: '#10b981',
          orange: '#f59e0b',
          pink: '#ec4899',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          glow: 'rgba(0,212,255,0.3)',
        },
        text: {
          primary: '#f0f4ff',
          secondary: '#8892a4',
          muted: '#4a5568',
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-cyber': 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
        'gradient-emerald': 'linear-gradient(135deg, #10b981, #00d4ff)',
        'gradient-fire': 'linear-gradient(135deg, #f59e0b, #ec4899)',
        'grid-pattern': `linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '50px 50px',
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0,212,255,0.4)',
        'glow-purple': '0 0 20px rgba(139,92,246,0.4)',
        'glow-emerald': '0 0 20px rgba(16,185,129,0.4)',
        'glow-lg': '0 0 60px rgba(0,212,255,0.2)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
        'inner-glow': 'inset 0 0 20px rgba(0,212,255,0.05)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
        'float': 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0,212,255,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(0,212,255,0.8)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      borderRadius: { 'xl': '16px', '2xl': '20px', '3xl': '24px' },
    }
  },
  plugins: []
}
