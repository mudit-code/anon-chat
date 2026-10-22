/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ff7320',
          hi: '#ff9150',
          light: '#ffb682',
          pale: '#ffd9bd',
        },
        surface: {
          header: '#0d0d0d',
          sidebar: '#0d0d0d',
          composer: '#1c1c1c',
          card: '#1a1a1a',
          modal: '#161616',
          bubble: '#222222',
        },
        danger: '#ff7b7b',
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        body: ['"Instrument Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'modal-in': 'modal-in 0.2s ease-out',
      },
      keyframes: {
        'fade-in': {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        'modal-in': {
          'from': { opacity: '0', transform: 'scale(0.97)' },
          'to': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}