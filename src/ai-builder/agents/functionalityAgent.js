export function functionalityAgent({ profile, requirements }) {
  const contact = profile?.contact || {}
  const hasPhone = Boolean(contact.phone)
  const hasWa = Boolean(contact.whatsappHref || contact.socialLinks?.whatsapp)
  const hasEmail = Boolean(contact.email)
  const hasMap = Boolean(profile?.location?.mapLink || profile?.location?.coordinates?.lat)
  const hasSocial = Object.values(contact.socialLinks || {}).some((v) => String(v || '').trim())
  const requestedWa = (requirements?.changes || []).some((c) => c.property === 'whatsapp' || c.value === true && c.target === 'functionality')
  return {
    operations: [
      {
        type: 'FUNCTIONALITY_CHANGE',
        target: { site: true },
        changes: {
          call: hasPhone,
          whatsapp: hasWa,
          enquiry: true,
          email: hasEmail,
          directions: hasMap,
          social: hasSocial,
        },
      },
    ],
    notices:
      requestedWa && !hasWa
        ? ['WhatsApp was requested but is not in your profile yet. Add it in Contact Details.']
        : [],
  }
}
