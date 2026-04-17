import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { colors: { navy: { 900: '#071220', 800: '#0B1C2D', 700: '#0d2035', 600: '#132B45', 500: '#1a3a5c' }, gold: { DEFAULT: '#C6A75E', light: '#E8C97A', dark: '#A8893D' } } } },
  plugins: [],
} satisfies Config;
