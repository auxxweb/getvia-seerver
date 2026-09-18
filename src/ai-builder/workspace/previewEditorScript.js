/**
 * Injected into isolated Vite previews.
 * Parent toggles edit mode; supports drag, resize, text edit, and color.
 */
export const PREVIEW_EDITOR_JS = `const MSG = {
  READY: 'getvia-preview-ready',
  SET_EDIT: 'getvia-preview-set-edit',
  SELECT: 'getvia-preview-select',
  LAYOUT: 'getvia-preview-layout',
  APPLY_LAYOUT: 'getvia-preview-apply-layout',
  PING: 'getvia-preview-ping',
  SET_STYLE: 'getvia-preview-set-style',
  TEXT: 'getvia-preview-text',
}

const SECTION_RE = /^(hero|about|offers|products|services|feed|gallery|testimonials|reviews|faq|pricing|cta|contact|location|hours|social|footer|nav)$/i
const TEXT_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'SPAN', 'A', 'LI', 'LABEL', 'BUTTON', 'CITE', 'SUMMARY', 'FIGCAPTION'])

let editMode = false
let selectedId = ''
let interaction = null
let toolbar = null
const sections = Object.create(null)
const texts = Object.create(null)

function post(type, payload = {}) {
  try {
    window.parent.postMessage({ source: 'getvia-isolated-preview', type, ...payload }, '*')
  } catch {
    /* ignore */
  }
}

function sectionState(id) {
  if (!sections[id]) sections[id] = { x: 0, y: 0, scale: 1, color: '', backgroundColor: '', width: null, height: null }
  return sections[id]
}

function sectionIdFrom(el) {
  if (!el || el === document.body || el === document.documentElement) return ''
  const marked = el.closest?.('[data-getvia-section]')
  if (marked) {
    const id = String(marked.getAttribute('data-getvia-section') || '').toLowerCase()
    if (SECTION_RE.test(id)) return id
  }
  let node = el
  while (node && node !== document.body) {
    const id = String(node.id || '').toLowerCase()
    if (SECTION_RE.test(id)) return id
    if (node.tagName === 'HEADER' || node.classList?.contains('nav')) return 'nav'
    if (node.tagName === 'FOOTER') return 'footer'
    node = node.parentElement
  }
  return ''
}

function sectionEl(id) {
  if (!id) return null
  return (
    document.querySelector(\`[data-getvia-section="\${id}"]\`) ||
    document.getElementById(id) ||
    (id === 'nav' ? document.querySelector('header.nav, header') : null)
  )
}

function textKey(el) {
  const section = sectionIdFrom(el) || 'site'
  const tag = (el.tagName || 'p').toLowerCase()
  const all = [...document.querySelectorAll(\`[data-getvia-section="\${section}"] \${tag}, #\${section} \${tag}\`)]
  const idx = Math.max(0, all.indexOf(el))
  return \`\${section}|\${tag}|\${idx}\`
}

function ensureStyle() {
  if (document.getElementById('getvia-preview-editor-style')) return
  const style = document.createElement('style')
  style.id = 'getvia-preview-editor-style'
  style.textContent = \`
    html.getvia-edit-mode { cursor: default; }
    html.getvia-edit-mode a:not([contenteditable="true"]),
    html.getvia-edit-mode button:not(.getvia-toolbar button),
    html.getvia-edit-mode summary {
      pointer-events: none !important;
    }
    html.getvia-edit-mode [data-getvia-section],
    html.getvia-edit-mode header.nav,
    html.getvia-edit-mode section[id],
    html.getvia-edit-mode footer {
      outline: 1px dashed rgba(0, 110, 18, 0.35);
      outline-offset: 2px;
      cursor: grab;
      position: relative;
    }
    html.getvia-edit-mode .getvia-selected {
      outline: 2px solid #006e12 !important;
      outline-offset: 3px;
      box-shadow: 0 0 0 4px rgba(0, 110, 18, 0.15);
      z-index: 5;
    }
    html.getvia-edit-mode .getvia-selected::before {
      content: attr(data-getvia-label);
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 7;
      background: #006e12;
      color: #fff;
      font: 600 11px/1.2 system-ui, sans-serif;
      padding: 4px 8px;
      border-radius: 999px;
      pointer-events: none;
    }
    .getvia-resize-handle {
      position: absolute;
      right: 4px;
      bottom: 4px;
      width: 14px;
      height: 14px;
      border-radius: 3px;
      background: #006e12;
      border: 2px solid #fff;
      cursor: nwse-resize;
      z-index: 8;
      box-shadow: 0 1px 4px rgba(0,0,0,.25);
      pointer-events: auto !important;
    }
    [contenteditable="true"].getvia-editing-text {
      outline: 2px solid #0ea5e9 !important;
      outline-offset: 2px;
      cursor: text !important;
      pointer-events: auto !important;
      min-width: 1ch;
    }
    .getvia-toolbar {
      position: fixed;
      z-index: 2147483646;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 12px;
      background: #0f172a;
      color: #fff;
      font: 600 11px/1.2 system-ui, sans-serif;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.35);
      pointer-events: auto;
    }
    .getvia-toolbar label { display: inline-flex; align-items: center; gap: 4px; }
    .getvia-toolbar input[type="color"] {
      width: 28px;
      height: 22px;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: pointer;
    }
    .getvia-toolbar button {
      border: 0;
      border-radius: 8px;
      background: #334155;
      color: #fff;
      padding: 5px 8px;
      cursor: pointer;
      font: inherit;
      pointer-events: auto !important;
    }
    .getvia-toolbar button:hover { background: #475569; }
    .getvia-toolbar .getvia-hint { opacity: .75; margin-left: 4px; }
  \`
  document.head.appendChild(style)
}

function applySectionStyles(id) {
  const el = sectionEl(id)
  const st = sectionState(id)
  if (!el) return
  const tx = st.x || 0
  const ty = st.y || 0
  const scale = st.scale && st.scale !== 1 ? st.scale : 1
  el.style.transform = tx || ty || scale !== 1 ? \`translate(\${tx}px, \${ty}px) scale(\${scale})\` : ''
  el.style.transformOrigin = 'top left'
  if (st.width) el.style.width = typeof st.width === 'number' ? \`\${st.width}px\` : st.width
  else el.style.removeProperty('width')
  if (st.height) el.style.minHeight = typeof st.height === 'number' ? \`\${st.height}px\` : st.height
  else el.style.removeProperty('min-height')
  if (st.color) el.style.color = st.color
  else el.style.removeProperty('color')
  if (st.backgroundColor) el.style.backgroundColor = st.backgroundColor
  else el.style.removeProperty('background-color')
}

function applyAll() {
  for (const id of Object.keys(sections)) applySectionStyles(id)
  for (const [key, value] of Object.entries(texts)) {
    const [section, tag, idx] = String(key).split('|')
    const list = [...document.querySelectorAll(\`[data-getvia-section="\${section}"] \${tag}, #\${section} \${tag}\`)]
    const el = list[Number(idx) || 0]
    if (el && typeof value === 'string') el.textContent = value
  }
}

function layoutPayload() {
  return { sections: { ...sections }, texts: { ...texts } }
}

function emitLayout(sectionId) {
  post(MSG.LAYOUT, { layout: layoutPayload(), sectionId: sectionId || selectedId || '' })
}

function clearResizeHandle() {
  document.querySelectorAll('.getvia-resize-handle').forEach((n) => n.remove())
}

function attachResizeHandle(el) {
  clearResizeHandle()
  if (!el) return
  const handle = document.createElement('div')
  handle.className = 'getvia-resize-handle'
  handle.title = 'Drag to resize'
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const st = sectionState(selectedId)
    const rect = el.getBoundingClientRect()
    interaction = {
      type: 'resize',
      id: selectedId,
      startX: e.clientX,
      startY: e.clientY,
      origScale: st.scale || 1,
      origW: rect.width,
      origH: rect.height,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  })
  el.appendChild(handle)
}

function placeToolbar(el) {
  if (!toolbar) return
  if (!el) {
    toolbar.style.display = 'none'
    return
  }
  toolbar.style.display = 'flex'
  const rect = el.getBoundingClientRect()
  const top = Math.max(8, rect.top - 48)
  const left = Math.min(window.innerWidth - 320, Math.max(8, rect.left))
  toolbar.style.top = \`\${top}px\`
  toolbar.style.left = \`\${left}px\`
}

function ensureToolbar() {
  if (toolbar) return toolbar
  toolbar = document.createElement('div')
  toolbar.className = 'getvia-toolbar'
  toolbar.innerHTML = \`
    <button type="button" data-act="smaller" title="Reduce size">−</button>
    <button type="button" data-act="bigger" title="Expand size">+</button>
    <label title="Text colour">Aa <input type="color" data-act="color" value="#111111" /></label>
    <label title="Background">Bg <input type="color" data-act="bg" value="#ffffff" /></label>
    <button type="button" data-act="reset-style" title="Reset colour/size">Reset style</button>
    <span class="getvia-hint">Double-click text to edit</span>
  \`
  toolbar.addEventListener('pointerdown', (e) => e.stopPropagation())
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]')
    if (!btn || !selectedId) return
    const act = btn.getAttribute('data-act')
    const st = sectionState(selectedId)
    if (act === 'bigger') st.scale = Math.min(1.8, Math.round(((st.scale || 1) + 0.08) * 100) / 100)
    if (act === 'smaller') st.scale = Math.max(0.55, Math.round(((st.scale || 1) - 0.08) * 100) / 100)
    if (act === 'reset-style') {
      st.scale = 1
      st.color = ''
      st.backgroundColor = ''
      st.width = null
      st.height = null
    }
    applySectionStyles(selectedId)
    emitLayout(selectedId)
  })
  toolbar.addEventListener('input', (e) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || !selectedId) return
    const st = sectionState(selectedId)
    if (input.getAttribute('data-act') === 'color') st.color = input.value
    if (input.getAttribute('data-act') === 'bg') st.backgroundColor = input.value
    applySectionStyles(selectedId)
    emitLayout(selectedId)
  })
  document.body.appendChild(toolbar)
  return toolbar
}

function syncToolbarInputs() {
  if (!toolbar || !selectedId) return
  const st = sectionState(selectedId)
  const color = toolbar.querySelector('[data-act="color"]')
  const bg = toolbar.querySelector('[data-act="bg"]')
  if (color instanceof HTMLInputElement) color.value = st.color || '#111111'
  if (bg instanceof HTMLInputElement) bg.value = st.backgroundColor || '#ffffff'
}

function setSelected(id) {
  document.querySelectorAll('.getvia-selected').forEach((n) => {
    n.classList.remove('getvia-selected')
    n.removeAttribute('data-getvia-label')
  })
  clearResizeHandle()
  selectedId = id || ''
  const el = sectionEl(selectedId)
  if (el) {
    el.classList.add('getvia-selected')
    el.setAttribute('data-getvia-label', selectedId)
    attachResizeHandle(el)
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    ensureToolbar()
    syncToolbarInputs()
    placeToolbar(el)
  } else if (toolbar) {
    toolbar.style.display = 'none'
  }
  post(MSG.SELECT, {
    sectionId: selectedId || 'site',
    selectedElement: selectedId ? { sectionId: selectedId } : { site: true },
    style: selectedId ? { ...sectionState(selectedId) } : null,
  })
}

function endTextEdit(el) {
  if (!el) return
  el.removeAttribute('contenteditable')
  el.classList.remove('getvia-editing-text')
  const key = textKey(el)
  texts[key] = el.textContent || ''
  post(MSG.TEXT, { key, text: texts[key], sectionId: sectionIdFrom(el) || selectedId || 'site' })
  emitLayout(sectionIdFrom(el) || selectedId)
}

function onDoubleClick(e) {
  if (!editMode) return
  const target = e.target
  if (!(target instanceof HTMLElement)) return
  if (!TEXT_TAGS.has(target.tagName)) return
  e.preventDefault()
  e.stopPropagation()
  const id = sectionIdFrom(target)
  if (id) setSelected(id)
  target.setAttribute('contenteditable', 'true')
  target.classList.add('getvia-editing-text')
  target.focus()
  const range = document.createRange()
  range.selectNodeContents(target)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  const finish = () => {
    target.removeEventListener('blur', finish)
    target.removeEventListener('keydown', onKey)
    endTextEdit(target)
  }
  const onKey = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      target.blur()
    }
    if (ev.key === 'Enter' && !ev.shiftKey && target.tagName !== 'P') {
      ev.preventDefault()
      target.blur()
    }
  }
  target.addEventListener('blur', finish)
  target.addEventListener('keydown', onKey)
}

function setEditMode(on) {
  editMode = Boolean(on)
  ensureStyle()
  document.documentElement.classList.toggle('getvia-edit-mode', editMode)
  if (!editMode) {
    document.querySelectorAll('.getvia-selected').forEach((n) => n.classList.remove('getvia-selected'))
    document.querySelectorAll('[contenteditable="true"]').forEach((n) => {
      n.removeAttribute('contenteditable')
      n.classList.remove('getvia-editing-text')
    })
    clearResizeHandle()
    selectedId = ''
    interaction = null
    if (toolbar) toolbar.style.display = 'none'
  } else {
    ensureToolbar()
  }
  post(MSG.READY, { editMode })
}

function onPointerDown(e) {
  if (!editMode || e.button !== 0) return
  if (e.target?.closest?.('.getvia-toolbar') || e.target?.closest?.('.getvia-resize-handle')) return
  if (e.target?.closest?.('[contenteditable="true"]')) return
  const id = sectionIdFrom(e.target)
  if (!id) {
    setSelected('')
    return
  }
  e.preventDefault()
  e.stopPropagation()
  setSelected(id)
  const el = sectionEl(id)
  if (!el) return
  const st = sectionState(id)
  interaction = {
    type: 'move',
    id,
    startX: e.clientX,
    startY: e.clientY,
    origX: st.x || 0,
    origY: st.y || 0,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(e) {
  if (!interaction) return
  const st = sectionState(interaction.id)
  if (interaction.type === 'move') {
    st.x = Math.round(interaction.origX + (e.clientX - interaction.startX))
    st.y = Math.round(interaction.origY + (e.clientY - interaction.startY))
  }
  if (interaction.type === 'resize') {
    const dx = e.clientX - interaction.startX
    const dy = e.clientY - interaction.startY
    const delta = Math.max(dx, dy)
    const next = Math.min(1.8, Math.max(0.55, interaction.origScale * (1 + delta / Math.max(interaction.origW, 120))))
    st.scale = Math.round(next * 100) / 100
  }
  applySectionStyles(interaction.id)
  placeToolbar(sectionEl(interaction.id))
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  if (!interaction) return
  const id = interaction.id
  interaction = null
  emitLayout(id)
  placeToolbar(sectionEl(id))
}

function ingestLayout(layout) {
  if (!layout || typeof layout !== 'object') return
  const incomingSections = layout.sections && typeof layout.sections === 'object' ? layout.sections : layout
  const incomingTexts = layout.texts && typeof layout.texts === 'object' ? layout.texts : layout._texts
  for (const [id, value] of Object.entries(incomingSections || {})) {
    if (id === 'texts' || id === '_texts' || id === 'sections') continue
    if (!value || typeof value !== 'object') continue
    sections[id] = {
      x: Number(value.x) || 0,
      y: Number(value.y) || 0,
      scale: Number(value.scale) || 1,
      color: value.color || '',
      backgroundColor: value.backgroundColor || '',
      width: value.width ?? null,
      height: value.height ?? null,
    }
  }
  if (incomingTexts && typeof incomingTexts === 'object') {
    Object.assign(texts, incomingTexts)
  }
  applyAll()
}

function onMessage(event) {
  const data = event.data
  if (!data || data.source !== 'getvia-ai-builder') return
  if (data.type === MSG.SET_EDIT) setEditMode(data.editMode)
  if (data.type === MSG.APPLY_LAYOUT) ingestLayout(data.layout)
  if (data.type === MSG.PING) post(MSG.READY, { editMode })
  if (data.type === MSG.SELECT && data.sectionId) setSelected(String(data.sectionId))
  if (data.type === MSG.SET_STYLE && data.sectionId) {
    const st = sectionState(String(data.sectionId))
    if (data.color != null) st.color = data.color
    if (data.backgroundColor != null) st.backgroundColor = data.backgroundColor
    if (data.scale != null) st.scale = Number(data.scale) || 1
    applySectionStyles(String(data.sectionId))
    emitLayout(String(data.sectionId))
    syncToolbarInputs()
  }
}

function boot() {
  ensureStyle()
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('dblclick', onDoubleClick, true)
  window.addEventListener('message', onMessage)
  window.addEventListener('scroll', () => placeToolbar(sectionEl(selectedId)), true)
  window.addEventListener('resize', () => placeToolbar(sectionEl(selectedId)))
  post(MSG.READY, { editMode: false })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
`

export const PREVIEW_EDITOR_MSG = Object.freeze({
  READY: 'getvia-preview-ready',
  SET_EDIT: 'getvia-preview-set-edit',
  SELECT: 'getvia-preview-select',
  LAYOUT: 'getvia-preview-layout',
  APPLY_LAYOUT: 'getvia-preview-apply-layout',
  PING: 'getvia-preview-ping',
  SET_STYLE: 'getvia-preview-set-style',
  TEXT: 'getvia-preview-text',
})
