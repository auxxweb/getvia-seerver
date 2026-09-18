const fs = require('fs')
const app = fs.readFileSync('src/App.jsx', 'utf8')
const data = fs.readFileSync('src/data/business.json', 'utf8')
if (app.includes('BROKEN') || data.includes('BROKEN')) {
  console.error('src/App.jsx: BROKEN marker')
  process.exit(1)
}
console.log('built')
