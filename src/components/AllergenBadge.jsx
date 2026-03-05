function AllergenBadge({ allergen, severity, small = false }) {
  const severityColors = {
    allergy: 'bg-red-100 text-red-800 border-red-200',
    intolerance: 'bg-orange-100 text-orange-800 border-orange-200',
    preference: 'bg-blue-100 text-blue-800 border-blue-200',
  }

  const severityLabels = {
    allergy: 'Allergia',
    intolerance: 'Intolleranza',
    preference: 'Preferenza',
  }

  const colorClass = severityColors[severity] || severityColors.allergy

  if (small) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${colorClass}`}
        title={`${allergen.name} (${severityLabels[severity] || 'Allergia'})`}
      >
        <span>{allergen.icon}</span>
        <span>{allergen.name}</span>
      </span>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${colorClass}`}>
      <span className="text-lg">{allergen.icon}</span>
      <div>
        <span className="font-medium">{allergen.name}</span>
        <span className="text-xs ml-1 opacity-75">({severityLabels[severity] || 'Allergia'})</span>
      </div>
    </div>
  )
}

export default AllergenBadge
