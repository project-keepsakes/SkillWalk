// Finite execution capabilities. The model can select a capability, never grant
// itself permissions or add commands, dependencies, services or network access.
export const capabilities = ['html', 'css', 'browser-javascript', 'slides', 'local-authoring', 'creator-reference', 'pdf-text', 'pdf-images', 'pdf-tables', 'local-vision', 'local-embeddings', 'retrieval', 'local-chat', 'unavailable'];
export const cssProperties = ['background-color', 'color', 'font-family', 'font-size', 'font-weight', 'text-align', 'border-top-width', 'border-top-style', 'border-top-color', 'border-collapse', 'display', 'padding-top', 'padding-left', 'margin-top', 'border-radius'];
export const documentCapabilities = ['pdf-text', 'pdf-images', 'pdf-tables', 'local-vision', 'local-embeddings', 'retrieval', 'local-chat'];

export function contractSchema(ids) {
  const citation = {type: 'string', enum: ids};
  const object = (properties) => ({type: 'object', additionalProperties: false, properties, required: Object.keys(properties)});
  const array = items => ({type: 'array', items, maxItems: 32});
  return object({
    summary: {type: 'string'},
    requirements: array(object({description: {type: 'string'}, capability: {type: 'string', enum: capabilities}, required: {type:'boolean'}, segment_id: citation})),
    steps: array(object({action: {type: 'string'}, required:{type:'boolean'}, segment_id: citation})),
    // Keep the inference grammar simple; validate text lengths after decoding.
    // The local runtime does not reliably constrain regex-bearing schemas.
    content: array(object({text: {type: 'string'}, selector: {type: 'string'}, segment_id: citation})),
    styles: array(object({selector: {type: 'string'}, property: {type: 'string', enum: cssProperties}, value: {type: 'string'}, segment_id: citation})),
    structure: array(object({selector: {type: 'string'}, minimum: {type: 'integer', minimum: 1, maximum: 100}, segment_id: citation})),
    interactions: array(object({type: {type: 'string', enum: ['click', 'click_console', 'keypress']}, target: {type: 'string'}, expected: {type: 'string'}, resultSelector:{type:'string'}, segment_id: citation})),
    referenceFrames: array(citation), uncertainty: {type: 'string'}
  });
}

export function validateContract(contract, sources) {
  const byId = new Map(sources.map(s => [s.id, s]));
  const errors = [];
  for (const group of ['requirements', 'steps', 'content', 'styles', 'structure', 'interactions']) {
    if (!Array.isArray(contract[group])) { errors.push('Missing ' + group); continue; }
    for (const item of contract[group]) {
      const source = byId.get(item.segment_id);
      if (!source) { errors.push('Unknown source citation'); continue; }
      item.quote = source.text; item.timestamp = source.start; item.sourceKind = source.sourceKind || 'caption';
      if ('selector' in item && (typeof item.selector !== 'string' || item.selector.length > 160 || !item.selector.trim())) errors.push('Invalid selector');
    }
  }
  if (!contract.requirements?.length || !contract.steps?.length || !contract.summary?.trim()) errors.push('Missing task requirements');
  for (const r of contract.requirements || []) if (!capabilities.includes(r.capability)) errors.push('Unknown capability');
  for (const s of contract.styles || []) if (!cssProperties.includes(s.property) || !s.value?.trim() || s.value.length > 120) errors.push('Invalid style requirement');
  const styleValues=new Map();
  for(const item of contract.styles||[]){
    const key=item.selector+' '+item.property,value=String(item.value).trim().toLowerCase();
    if(styleValues.has(key)&&styleValues.get(key)!==value)errors.push('Conflicting final style: '+key);
    styleValues.set(key,value);
  }
  for (const s of contract.structure || []) if (!Number.isInteger(s.minimum) || s.minimum < 1 || s.minimum > 100) errors.push('Invalid structure count');
  for (const c of contract.content || []) if (!c.text?.trim() || c.text.length > 1500) errors.push('Invalid required content');
  for (const c of contract.interactions || []) if (!['click', 'click_console', 'keypress'].includes(c.type) || !c.target || !c.expected) errors.push('Invalid interaction');
  const required = new Set((contract.requirements || []).filter(r=>r.required!==false).map(r => r.capability));
  contract.artifact = required.has('unavailable') ? 'unsupported' : [...required].some(c => documentCapabilities.includes(c)) ? 'document-app' : 'html';
  if (contract.artifact === 'html' && [...required].some(c => ['browser-javascript', 'slides'].includes(c)) && !contract.interactions?.length) errors.push('Interactive source requires an executable interaction check');
  if (contract.artifact === 'html' && [...required].some(c => !['html', 'css', 'browser-javascript', 'slides', 'local-authoring', 'creator-reference', 'unavailable'].includes(c))) errors.push('HTML cannot replace required document operations');
  if (contract.artifact === 'html' && !['html','slides'].some(c=>required.has(c))) errors.push('Source must identify a concrete supported artifact');
  if (contract.artifact === 'document-app' && !documentCapabilities.every(c => required.has(c))) errors.push('Document adapter requires the full multimodal retrieval workflow');
  if (contract.artifact === 'html' && (!contract.content?.length || !contract.styles?.length)) errors.push('HTML requires both source content and style assertions');
  if (!Array.isArray(contract.referenceFrames) || contract.referenceFrames.some(id => byId.get(id)?.sourceKind !== 'frame-observation')) errors.push('Invalid reference frame');
  contract.supported = errors.length === 0 && ['html', 'document-app'].includes(contract.artifact) && !required.has('unavailable');
  contract.interactive = Boolean(contract.interactions?.length);
  return errors;
}
