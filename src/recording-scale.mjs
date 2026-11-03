// A source-only capture hypothesis, never an assertion about original browser zoom.
// Restrict to plain white canvases and near-uniform foreground scaling.
function foreground(image){
 const {width,height,data}=image;
 if(width<20||height<20||data.length!==width*height*4)return null;
 for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1]]){
  const i=(y*width+x)*4;if(data[i]<240||data[i+1]<240||data[i+2]<240)return null;
 }
 let left=width,top=height,right=0,bottom=0,count=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  if(255-(data[i]+data[i+1]+data[i+2])/3>48){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);count++;}
 }
 if(count<20||count>width*height*.4||right-left<10||bottom-top<10)return null;
 return {left,top,width:right-left,height:bottom-top};
}
export function estimateRecordingScale(creator,video){
 const source=foreground(creator),target=foreground(video);
 if(!source||!target)return {scale:1,applied:false,reason:'No bounded plain-background scale estimate'};
 const x=target.width/source.width,y=target.height/source.height;
 if(Math.abs(x-y)/Math.max(x,y)>.1||Math.min(x,y)<.5||Math.max(x,y)>3)return {scale:1,applied:false,reason:'Foreground is not consistent with bounded uniform scaling',source,target};
 const scale=Math.round((x+y)/2*20)/20;
 return {scale,applied:Math.abs(scale-1)>.05,source,target,reason:'Uniform source-only foreground scale hypothesis; browser zoom unverified'};
}

export function preservesVisibleSemantics(before,after){
 const semantic=items=>items.map(({tag,id,text,value,checked,style})=>({tag,id,text,value,checked,style}));
 return JSON.stringify(semantic(before))===JSON.stringify(semantic(after));
}
