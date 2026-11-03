export function checkDocumentAnswer(index,result){
 const answer=String(result?.answer||'').replace(/[*_]/g,'').toLowerCase(),evidence=result?.evidence||[];
 if(!answer||!evidence.length)return false;
 // A supported answer followed by a bare refusal is contradictory, even when
 // it also contains the expected figures. Qualified uncertainty (e.g. the year)
 // is different and remains subject to the question-specific checks below.
 if((index===0||index===1)&&/(?:^|[.!?]\s*)(?:i\s+)?(?:do not|don't) know(?:[.!?]|$)/.test(answer))return false;
 if(index===0)return !/touris|exports?|receipts|not (?:its|the) population|do not know (?:the )?population|cannot (?:determine|provide)[^.!?]{0,40}population/.test(answer)&&!(/france|egypt|japan|united states/.test(answer)&&!/germany/.test(answer))&&/\b(?:7[5-9]|8\d|90)(?:\.\d+)?\s*million/.test(answer)&&evidence.some(e=>e.kind?.includes('Image')&&/germany/i.test(e.text||''));
 if(index===1){
  const us=answer.match(/united states[^\d]{0,90}(\d+(?:\.\d+)?)\s*million/),egypt=answer.match(/egypt[^\d]{0,90}(\d+(?:\.\d+)?)\s*million/);
  const wrong=/egypt[^.!?]{0,45}(?:larger|greater|higher|more|bigger)[^.!?]{0,60}(?:than|compared to)[^.!?]{0,15}united states/.test(answer);
  return Boolean(us&&egypt&&+us[1]>=320&&+us[1]<=345&&+egypt[1]>=90&&+egypt[1]<=115&&+us[1]>+egypt[1]&&!wrong&&/larger|greater|higher|more|bigger|exceeds/.test(answer)&&evidence.some(e=>e.kind?.includes('Image'))&&evidence.some(e=>e.kind?.includes('Table')));
 }
 if(index===2)return isUnsupportedTicketAnswer(answer);
 return false;
}

export function isUnsupportedTicketAnswer(answer){
 const text=String(answer).toLowerCase().replace(/[*_]/g,'').trim();
 // A refusal elsewhere in the response cannot excuse an invented price.
 if(!text||/[\d$€£¥]|\b(?:dollars?|euros?|pounds?|free|complimentary|costs?)\s+(?:is\s+)?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred)\b/.test(text))return false;
 if(/^(?:i\s+)?(?:do not|don't) know[.!]?$/i.test(text))return true;
 const sentences=text.split(/[.!?]+/).map(s=>s.trim()).filter(Boolean);
 return sentences.length>0&&sentences.every(sentence=>{
  const refusal=/do not know|don't know|cannot (?:determine|answer|provide|find|tell)|not (?:provided|contain|mention|include|available|specif)|no (?:information|mention|ticket)|does not (?:contain|mention|include|specif)|isn't (?:provided|available|specified)/.test(sentence);
  return refusal&&/ticket|price|cost|concert|document|context|information/.test(sentence)&&!/(?:costs?|priced? at|charge[sd]?)\s+(?:is\s+)?(?:free|complimentary|[a-z]+ dollars?)/.test(sentence);
 });
}

export function hasInventedSampleDates(corpus){return corpus.filter(x=>x.figure).some(x=>/\b(?:19|20)\d{2}\b/.test(x.text));}
