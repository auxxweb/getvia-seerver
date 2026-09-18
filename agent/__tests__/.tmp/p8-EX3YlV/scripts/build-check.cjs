const fs = require('fs')
const app = fs.readFileSync('src/App.jsx', 'utf8')
if (app.includes('BROKEN')) { console.error('BROKEN'); process.exit(1) }
console.log('built')
