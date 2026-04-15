/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        booking: '#003580',
        airbnb: '#FF5A5F',
        direct: '#10B981',
      },
    },
  },
  plugins: [],
}
