export function completeVerdicts(items, requirements) {
  const count=requirements.length;
  return Array.isArray(items) && items.length === count &&
    new Set(items.map(item=>item.index)).size === count &&
    items.every(item=>Number.isInteger(item.index) && item.index>=0 && item.index<count &&
      typeof item.met==='boolean' && (item.met || requirements[item.index].required===false) &&
      typeof item.evidence==='string' && item.evidence.trim());
}

export function documentSourcePassed(review, plan) {
  return review.uncertain===false && review.stylingMatches===true &&
    Array.isArray(review.missingOperations) && review.missingOperations.length===0 &&
    completeVerdicts(review.requirements,plan.requirements) &&
    completeVerdicts(review.steps,plan.steps);
}
