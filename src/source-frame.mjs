export function validArtifactBounds(bounds) {
  if (!bounds || !['x','y','width','height'].every(k=>Number.isInteger(bounds[k]))) return false;
  return bounds.x>=0 && bounds.y>=0 && bounds.width>=80 && bounds.height>=80 &&
    bounds.x+bounds.width<=1000 && bounds.y+bounds.height<=1000;
}

export function artifactCropFilter(bounds) {
  if (!validArtifactBounds(bounds)) throw Error('Invalid artifact region');
  const {x,y,width,height}=bounds;
  return `crop=iw*${width}/1000:ih*${height}/1000:iw*${x}/1000:ih*${y}/1000`;
}

export function frameEvidence(frame) {
  return {id:frame.id,timestamp:frame.timestamp,view:frame.view,
    artifactText:frame.artifactVerified ? frame.artifactOCR||'' : '',
    interpretation:frame.visibleText?.join('\n')||'',
    artifactVerified:frame.artifactVerified===true,
    sourceCode:frame.code,appearance:frame.appearance,uncertainty:frame.uncertainty};
}

export function cropIsArtifact(review) {
  return review?.containsEditor===false && review?.containsBrowserToolbar===false &&
    review?.pageReadable===true && review?.uncertain===false;
}

export function applyArtifactObservation(observation, review) {
  if (!cropIsArtifact(review) || typeof review.artifactAppearance !== 'string' ||
      !review.artifactAppearance.trim() || !Array.isArray(review.artifactText) ||
      review.artifactText.some(text => typeof text !== 'string')) return observation;
  // Full-frame descriptions can describe editor chrome instead of the page.
  // Keep transcribed source code, but ground rendered styling in the actual crop.
  return {...observation, view:'artifact', visibleText:review.artifactText,
    appearance:review.artifactAppearance, uncertainty:''};
}
