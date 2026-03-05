/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wine: {
          50: '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d9',
          300: '#f4a9ba',
          400: '#ec7896',
          500: '#df4b74',
          600: '#cc2d5c',
          700: '#ab1f4a',
          800: '#8f1d42',
          900: '#7a1c3d',
        }
      }
    },
  },
  plugins: [],
}
