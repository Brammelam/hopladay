import { type Config } from 'tailwindcss'

export default <Config>{
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E8F5FB',
          100: '#D1EBF7',
          300: '#7EC2E0',
          500: '#3A8FBF',
          600: '#2F769D',
          700: '#245B79',
        },
        secondary: {
          50: '#FFF8EE',
          100: '#FCEFD9',
          200: '#F6E3C2',
        },
        accent: {
          50: '#FFEDE8',
          100: '#FFD1C4',
          400: '#FF8A64',
          500: '#FF6B4A',
          600: '#E45537',
        },
      },
    },
  },
  plugins: [],
}
