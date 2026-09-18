export const DESIGNER_MUTATION_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['operations'],
  properties: {
    intent: { type: 'string' },
    target: {
      type: 'object',
      additionalProperties: true,
      properties: {
        pageId: { type: 'string' },
        sectionId: { type: ['string', 'null'] },
        componentId: { type: ['string', 'null'] },
      },
    },
    suggestions: { type: 'array', items: { type: 'string' } },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'UPDATE_TEXT',
              'UPDATE_STYLE',
              'UPDATE_THEME',
              'ADD_COMPONENT',
              'REMOVE_COMPONENT',
              'ADD_SECTION',
              'UPDATE_LINK',
              'UPDATE_BUTTON',
              'REORDER_SECTION',
              'UPDATE_RESPONSIVE_STYLE',
              'UPDATE_VISIBILITY',
              'UPDATE_LAYOUT',
            ],
          },
          target: {
            type: 'object',
            additionalProperties: true,
            properties: {
              pageId: { type: 'string' },
              sectionId: { type: ['string', 'null'] },
              componentId: { type: ['string', 'null'] },
              site: { type: 'boolean' },
            },
          },
          value: {},
          componentType: { type: 'string' },
          component: {
            type: 'object',
            additionalProperties: true,
            properties: {
              type: { type: 'string', enum: ['heading', 'paragraph', 'button', 'image', 'badge'] },
              props: { type: 'object', additionalProperties: true },
            },
          },
          changes: { type: 'object', additionalProperties: true },
          action: { type: 'object', additionalProperties: true },
          beforeSectionId: { type: 'string' },
          afterSectionId: { type: 'string' },
        },
      },
    },
  },
}
