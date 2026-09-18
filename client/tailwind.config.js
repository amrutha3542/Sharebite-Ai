/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17352d',
        moss: '#6a7d76',
        line: '#dce9e3',
        soft: '#f3f8f5',
        mint: '#e5f4eb',
        leaf: '#1c8c5a',
        leafdark: '#126543',
        lime: '#d7ed73',
        amber2: '#f5a15b',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 18px 50px rgba(24,63,47,.09)',
      },
    },
  },
  plugins: [],
};
