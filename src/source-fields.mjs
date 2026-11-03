// Schema hints do not enforce ownership when a local model ignores its grammar.
// A content/style repair cannot replace the approved requirements or operations.
export function sourceFields(value, fields) {
  if(!value || Array.isArray(value) || typeof value!=='object')throw Error('Expected a source extraction object');
  if(fields.some(field=>!Object.hasOwn(value,field)))throw Error('Missing source extraction fields');
  return Object.fromEntries(fields.map(field=>[field,value[field]]));
}
