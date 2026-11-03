export function normalizeHTML(text){return text.trim().replace(/^```(?:html)?\s*/i,'').replace(/\s*```$/,'');}

// Only strip comments from an unambiguous leading head stylesheet. Other HTML
// contexts stay conservative: a <style> string in script, title, attributes or
// comments must never hide active markup from the policy scan.
function withoutStyleComments(html){
 return html.replace(/^(\s*(?:<!doctype\s+html\s*>\s*)?<html(?=[\t\n\f\r />])(?:[^"'<>]|"[^"]*"|'[^']*')*>\s*<head>\s*(?:(?:<meta(?=[\t\n\f\r />])(?:[^"'<>]|"[^"]*"|'[^']*')*>|<title>[^<]*<\/title>)\s*)*<style(?=[\t\n\f\r />])(?:[^"'<>]|"[^"]*"|'[^']*')*>)((?:(?!<\/style(?=[\t\n\f\r />]))[\s\S])*)(<\/style\s*>)/i,(_,open,css,close)=>{
  let out='',quote=null;
  for(let i=0;i<css.length;i++){
   const c=css[i];
   if(quote){out+=c;if(c==='\\'&&i+1<css.length)out+=css[++i];else if(c===quote)quote=null;continue;}
   if(c==='\\'&&i+1<css.length){out+=c+css[++i];continue;}
   if(c==='"'||c==="'"){quote=c;out+=c;continue;}
   if(c==='/'&&css[i+1]==='*'){const end=css.indexOf('*/',i+2);if(end<0)break;i=end+1;out+=' ';continue;}
   out+=c;
  }
  return open+out+close;
 });
}

export function artifactIssues(html){

 const issues=[];

 if(!/^<!doctype html>|^<html/i.test(html)||!/<\/html>\s*$/i.test(html))issues.push('Return a complete standalone HTML document.');

 const checked=withoutStyleComments(html).replaceAll('http://www.w3.org/2000/svg','');const bad=checked.split('\n').filter(line=>/<(iframe|object|embed)\b|<script[^>]+src\s*=|https?:\/\/|@import|fetch\s*\(|XMLHttpRequest|WebSocket|window\.open|location\s*=/i.test(line));

 if(activeAttributes(html))issues.push('Unsupported active HTML attributes.');
 if(bad.length)issues.push('Unsupported network/embedding markup. Remove external stylesheet links entirely; Licensed fonts are embedded by the host. Do not replace links with another URL. Offending lines: '+bad.join(' '));

 return issues;

}


export function removeDecorativeArrows(html){return html.replace(/content\s*:\s*(["'])[»→↗↳➜➝➞]\1\s*;?/g,'content: \"\";');}

export function activeAttributes(html){for(const tag of html.match(/<[^>]+>/g)||[]){const attrs=tag.replace(/^<\/?[^\s/>]+/,'').replace(/\/?\s*>$/,'');for(const m of attrs.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)){const name=m[1].toLowerCase(),value=m[2]??m[3]??m[4]??'';const decoded=value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi,(_,hex,dec)=>{const cp=parseInt(hex||dec,hex?16:10);return cp<=0x10ffff?String.fromCodePoint(cp):'';}).replace(/&colon;/gi,':').replace(/&(?:Tab|NewLine);/gi,'').replace(/[\u0000-\u0020]/g,'');if(/^on\w+/.test(name)||name==='http-equiv'||/^javascript:/i.test(decoded)||(['href','xlink:href','action','formaction'].includes(name)&&decoded&&!decoded.startsWith('#')))return true;}}return false;}

export function stripEventAttributes(html){return html.replace(/<[^>]+>/g,tag=>{const head=tag.match(/^<\/?[^\s/>]+/)?.[0];if(!head)return tag;const attrs=tag.slice(head.length),remove=[];for(const m of attrs.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))if(/^on\w+/i.test(m[1]))remove.push({start:head.length+m.index,end:head.length+m.index+m[0].length});for(const span of remove.reverse())tag=tag.slice(0,span.start)+tag.slice(span.end);return tag;});}
