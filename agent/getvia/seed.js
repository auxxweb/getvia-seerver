import fs from 'node:fs/promises'
import path from 'node:path'
import { businessJsonFromProfile } from './workspaceData.js'

export function siteIndexHtml(name = 'Site') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${String(name || 'Website').replace(/</g, '')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
}

export function siteMainJsx() {
  return `import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(<App />)
`
}

export function sitePackageJson() {
  return `${JSON.stringify(
    {
      name: 'getvia-site',
      private: true,
      type: 'module',
      scripts: {
        build: 'node -e "console.log(\'built\')"',
        preview: 'node -e "console.log(\'preview\')"',
      },
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
    },
    null,
    2,
  )}\n`
}

export async function seedWorkspaceFromProfile({ workspaceDir, profile, runtime, ctx } = {}) {
  if (!workspaceDir || !profile) return { ok: false, written: [], message: 'workspaceDir and profile are required.' }
  const files = [
    { path: 'package.json', contents: sitePackageJson() },
    { path: 'index.html', contents: siteIndexHtml(profile.name) },
    { path: 'src/main.jsx', contents: siteMainJsx() },
    { path: 'src/index.css', contents: 'body{margin:0}#root{min-height:100vh}\n' },
    {
      path: 'src/App.jsx',
      contents: `export default function App() {
  return <div id="top" className="site"><p>Loading listing…</p></div>
}
`,
    },
    { path: 'src/data/business.json', contents: `${JSON.stringify(businessJsonFromProfile(profile), null, 2)}\n` },
  ]
  const written = []
  if (runtime && ctx) {
    for (const file of files) {
      const write = await runtime.callTool('write_file', file, ctx)
      if (write.success) written.push(file.path)
    }
  } else {
    for (const file of files) {
      const full = path.join(workspaceDir, file.path)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, file.contents, 'utf8')
      written.push(file.path)
    }
  }
  return { ok: written.includes('src/data/business.json'), written }
}
