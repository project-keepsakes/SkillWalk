// Provenance stays in plan.json. Repeating whole frame/caption quotations for
// every assertion can evict the actual task from the local model's context.
export function contractPromptData(plan) {
  return Object.fromEntries(Object.entries(plan).map(([key, value]) => [key,
    Array.isArray(value) ? value.map(item => {
      if (!item || typeof item !== 'object') return item;
      const {quote, ...assertion} = item;
      return assertion;
    }) : value
  ]));
}
