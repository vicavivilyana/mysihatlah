/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#12235c', deep: '#0c1740', soft: '#2a3a72' },
        gold: { DEFAULT: '#c99a2e', light: '#e7b942', wash: '#faf3e2' },
        red: { DEFAULT: '#c0202f', wash: '#fdf0f1' },
        sand: '#f5f6fa',        // off-white app background
        ink: { DEFAULT: '#1a1f36', muted: '#5f6784' },
        hairline: '#e5e8f0',
        // Soft pastel tiles used on quick-access / list icons (from mockups).
        tile: {
          blue: '#dfe3f7',
          gold: '#fbecc8',
          rose: '#fadadd',
          mint: '#d9f0e1',
        },
        success: '#2eb872',
      },
      borderRadius: { card: '20px', xl2: '22px', pill: '999px' },
      boxShadow: {
        // Subtle only — no heavy gradients.
        card: '0 1px 2px rgba(18,35,92,0.04), 0 10px 30px -18px rgba(18,35,92,0.25)',
        raised: '0 2px 6px rgba(18,35,92,0.06), 0 18px 40px -20px rgba(18,35,92,0.35)',
        tab: '0 -1px 0 rgba(18,35,92,0.06)',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      transitionTimingFunction: { soft: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
};
