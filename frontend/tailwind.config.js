/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        panel: 'var(--panel)',
        line: 'var(--line)',
        text: 'var(--text)',
        'text-strong': 'var(--text-strong)',
        'text-soft': 'var(--text-soft)',
        muted: 'var(--muted)',
        cyan: {
          500: 'var(--cyan)',
        },
        green: {
          500: 'var(--green)',
        },
        amber: {
          500: 'var(--amber)',
        },
        red: {
          500: 'var(--red)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 8px -1px rgba(0, 0, 0, 0.03)',
        'card-dark': '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [],
}
