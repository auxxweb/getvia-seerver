import { AI_SECTION_TYPES, BUTTON_ACTIONS } from '../constants.js'

export const COMPONENT_TYPES = ['heading', 'paragraph', 'button', 'image', 'badge']

const BUTTON_PROPS = ['text', 'href', 'variant', 'size', 'icon', 'alignment', 'action', 'background', 'color', 'fullWidthMobile']
const HEADING_PROPS = ['text', 'alignment', 'color']
const PARAGRAPH_PROPS = ['text', 'alignment', 'color']
const IMAGE_PROPS = ['src', 'alt', 'publicId']
const BADGE_PROPS = ['text', 'variant']

export const ComponentRegistry = {
  heading: { type: 'heading', editableProperties: HEADING_PROPS },
  paragraph: { type: 'paragraph', editableProperties: PARAGRAPH_PROPS },
  button: { type: 'button', editableProperties: BUTTON_PROPS, allowedActions: BUTTON_ACTIONS },
  image: { type: 'image', editableProperties: IMAGE_PROPS },
  badge: { type: 'badge', editableProperties: BADGE_PROPS },
  hero: {
    type: 'hero',
    allowedComponents: ['heading', 'paragraph', 'button', 'image', 'badge'],
    editableProperties: ['heading', 'description', 'image', 'alignment', 'background', 'height', 'visualStyle'],
  },
  about: {
    type: 'about',
    allowedComponents: ['heading', 'paragraph', 'image', 'button'],
    editableProperties: ['heading', 'description', 'image', 'visualStyle'],
  },
  services: {
    type: 'services',
    allowedComponents: ['heading', 'paragraph', 'button'],
    editableProperties: ['heading', 'description', 'cardStyle', 'visualStyle'],
  },
  products: {
    type: 'products',
    allowedComponents: ['heading', 'paragraph', 'button'],
    editableProperties: ['heading', 'description', 'cardStyle', 'visualStyle'],
  },
  offers: {
    type: 'offers',
    allowedComponents: ['heading', 'paragraph', 'button'],
    editableProperties: ['heading', 'description', 'cardStyle', 'visualStyle'],
  },
  gallery: {
    type: 'gallery',
    allowedComponents: ['heading', 'image'],
    editableProperties: ['heading', 'visualStyle'],
  },
  faq: {
    type: 'faq',
    allowedComponents: ['heading', 'paragraph'],
    editableProperties: ['heading', 'visualStyle'],
  },
  reviews: {
    type: 'reviews',
    allowedComponents: ['heading', 'paragraph'],
    editableProperties: ['heading', 'visualStyle'],
  },
  cta: {
    type: 'cta',
    allowedComponents: ['heading', 'paragraph', 'button'],
    editableProperties: ['heading', 'description', 'visualStyle'],
  },
  contact: {
    type: 'contact',
    allowedComponents: ['heading', 'paragraph', 'button'],
    editableProperties: ['heading', 'visualStyle'],
  },
  hours: {
    type: 'hours',
    allowedComponents: ['heading', 'paragraph'],
    editableProperties: ['heading'],
  },
  footer: {
    type: 'footer',
    allowedComponents: ['paragraph'],
    editableProperties: ['visualStyle'],
  },
}

export function getSectionCapability(sectionType) {
  return ComponentRegistry[sectionType] || null
}

export function isAllowedComponentType(sectionType, componentType) {
  const cap = getSectionCapability(sectionType)
  if (!cap?.allowedComponents) return COMPONENT_TYPES.includes(componentType)
  return cap.allowedComponents.includes(componentType)
}

export function isEditableProperty(componentType, prop) {
  const cap = ComponentRegistry[componentType]
  return Boolean(cap?.editableProperties?.includes(prop))
}

export function designerContextForSelection({ state, selectedElement }) {
  const pageId = selectedElement?.pageId || 'home'
  const sectionId = selectedElement?.sectionId || null
  const section = (state?.pages?.[0]?.sections || []).find(
    (row) => row.id === sectionId || row.type === sectionId,
  )
  const componentId = selectedElement?.componentId || null
  const component = (section?.components || []).find((row) => row.id === componentId) || null
  const sectionCap = section ? getSectionCapability(section.type || section.id) : null
  const componentCap = component ? ComponentRegistry[component.type] : null
  return {
    selectedElement: {
      pageId,
      sectionId: section?.id || sectionId,
      componentId: component?.id || componentId,
    },
    componentType: component?.type || null,
    currentProperties: component?.props || null,
    allowedProperties: componentCap?.editableProperties || sectionCap?.editableProperties || [],
    allowedComponents: sectionCap?.allowedComponents || [],
    sectionTypes: AI_SECTION_TYPES,
  }
}
