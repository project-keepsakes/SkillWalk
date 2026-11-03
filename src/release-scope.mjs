import {tutorials,compatibilityFor} from './tutorials.mjs';
export const releaseScopeMessage='This completed release supports the three listed tutorials only. The fourth tutorial is a preserved experimental case study, not an executable supported workflow.';
export function releaseCompatibility(id){
 return tutorials.some(t=>t.id===id)?compatibilityFor(id):{available:false,kind:'unsupported',featured:false,message:releaseScopeMessage};
}
export function historicalExperiment(run){return run?.pipeline==='shared-v1'||run?.kind==='generic';}
