export const compatibilityNotice = 'This completed showcase supports three selected tutorials using local Gemma and vetted execution recipes. Model and hardware differences can affect results. The fourth tutorial is an experimental case study; arbitrary YouTube execution is not supported.';

export function failureMessage(failure, {stopped = false} = {}) {
  const detail = String(failure || 'The local run stopped before verification finished.');
  let action = 'Review the failed check below before retrying. A retry may produce a different result.';
  if (/captions|transcript/i.test(detail)) action = 'Check caption availability for the selected supported tutorial before retrying.';
  else if (/ECONNREFUSED|fetch failed|model.*(?:unavailable|not found)/i.test(detail)) action = 'Check that the configured local Gemma service is running, then retry.';
  else if (/outside supported|unavailable required|unsupported capability/i.test(detail)) action = 'Choose one of the three supported tutorials and check its setup requirements.';
  return `${stopped ? 'SkillWalk stopped this tutorial.' : 'SkillWalk couldn’t complete this tutorial.'} What failed: ${detail} What’s available: No verified final result from this attempt. Any visible preview is unverified. What you can try: ${action} This run is incomplete; SkillWalk has not verified that the output matches the tutorial.`;
}
