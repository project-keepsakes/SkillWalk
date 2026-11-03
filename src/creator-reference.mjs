// Read creator guidance as source data. This is a bounded prompt adaptation,
// not a native agent skill invocation or authority to execute its commands.
export function creatorReference(files, limit=16000) {
  let remaining=limit;
  const priority=name=>/SKILL\.md$/i.test(name)?0:/STYLE/i.test(name)?1:/README\.md$/i.test(name)?2:3;
  const selected=[];
  for(const file of files.filter(file=>/\.md$/i.test(file.name)).sort((a,b)=>priority(a.name)-priority(b.name))) {
    if(remaining<=0)break;
    const text=file.text.slice(0,Math.min(8000,remaining));remaining-=text.length;
    selected.push({id:file.id,name:file.name,text,truncated:text.length<file.text.length});
  }
  return {mode:'bounded creator-reference text in local model prompt; no native skill invocation',selected,
    omitted:files.filter(file=>/\.md$/i.test(file.name)&&!selected.some(item=>item.id===file.id)).map(file=>file.id)};
}
