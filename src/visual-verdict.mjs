// Model JSON is untrusted even when the request supplies a schema.
export function sourceFidelityPassed(review) {
  return review?.contentMatches === true && review.stylingMatches === true &&
    review.uncertain === false && Array.isArray(review.differences) &&
    review.differences.length === 0 &&
    ['sourceContent', 'outputContent', 'sourceStyle', 'outputStyle'].every(
      key => typeof review[key] === 'string' && review[key].trim().length > 0);
}

export function renderReviewPassed(review) {
  return review?.acceptable === true && Array.isArray(review.issues) && review.issues.length === 0;
}
