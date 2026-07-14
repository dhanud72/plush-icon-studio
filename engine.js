
/* Spec-driven render engine. Everything below works on a plain `spec`
   object (see AGENTS.md for the schema) and has no UI dependencies,
   so it can be extracted to engine.js and reused by other pages. */
/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function hexToRgb(h){h=h.replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  let h=0,s=0;const l=(mx+mn)/2;if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);
  switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
  return [h,s,l];}
function hslToRgb(h,s,l){h=((h%1)+1)%1;
  const f=(n)=>{const k=(n+h*12)%12;const a=s*Math.min(l,1-l);
  return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)];}
/* shift lightness dl (-1..1), saturation ds */
function shade(hex,dl,ds){const [r,g,b]=hexToRgb(hex);let [h,s,l]=rgbToHsl(r,g,b);
  l=Math.max(0,Math.min(1,l+dl));s=Math.max(0,Math.min(1,s+(ds||0)));
  const [r2,g2,b2]=hslToRgb(h,s,l);return `rgb(${r2},${g2},${b2})`;}
function shadeA(hex,dl,a){const [r,g,b]=hexToRgb(hex);let [h,s,l]=rgbToHsl(r,g,b);
  l=Math.max(0,Math.min(1,l+dl));const [r2,g2,b2]=hslToRgb(h,s,l);
  return `rgba(${r2},${g2},${b2},${a})`;}
/* hue/sat/light-shifted hex (for deriving B/C when a preset has none) */
function hexShift(hex,dh,ds,dl){const [r,g,b]=hexToRgb(hex);let [h,s,l]=rgbToHsl(r,g,b);
  s=Math.max(0,Math.min(1,s+ds));l=Math.max(0,Math.min(1,l+dl));
  const [r2,g2,b2]=hslToRgb(h+dh,s,l);
  return "#"+[r2,g2,b2].map(v=>v.toString(16).padStart(2,"0")).join("");}

/* ---------- shape ---------- */
function shapePath(type,S){
  const p=new Path2D(),c=S/2;
  if(type==="circle"){p.arc(c,c,S*0.335,0,Math.PI*2);}
  else if(type==="pill"){
    const w=S*0.78,h=S*0.40,x=c-w/2,y=c-h/2,r=h/2;
    p.moveTo(x+r,y);p.lineTo(x+w-r,y);p.arc(x+w-r,y+r,r,-Math.PI/2,Math.PI/2);
    p.lineTo(x+r,y+h);p.arc(x+r,y+r,r,Math.PI/2,Math.PI*1.5);p.closePath();
  }else{ /* squircle */
    const w=S*0.70,x=c-w/2,y=c-w/2,r=w*0.34;
    p.moveTo(x+r,y);p.lineTo(x+w-r,y);p.quadraticCurveTo(x+w,y,x+w,y+r);
    p.lineTo(x+w,y+w-r);p.quadraticCurveTo(x+w,y+w,x+w-r,y+w);
    p.lineTo(x+r,y+w);p.quadraticCurveTo(x,y+w,x,y+w-r);
    p.lineTo(x,y+r);p.quadraticCurveTo(x,y,x+r,y);p.closePath();
  }
  return p;
}
/* boundary radius per angle via binary search (shapes are convex) */
function boundaryRadii(ctx,path,S,n){
  const c=S/2,out=new Float32Array(n);
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a);
    let lo=0,hi=S*0.62;
    for(let k=0;k<9;k++){const m=(lo+hi)/2;
      if(ctx.isPointInPath(path,c+dx*m,c+dy*m))lo=m;else hi=m;}
    out[i]=lo;
  }
  return out;
}

/* ---------- glyph mask ---------- */
const maskCache=new Map();
function buildGlyphMask(S,spec){
  const key=S+"|"+spec.glyphScale+"|"+spec.glyphText+"|"+(spec.svgPath||"").trim()
    +"|u"+(spec.uploadImg?spec.uploadId:0);
  if(!maskCache.has(key)){
    if(maskCache.size>16)maskCache.clear();
    const m=buildGlyphMaskUncached(S,spec);
    if(m)m.bbox=alphaBBox(m.canvas.getContext("2d"),S);
    maskCache.set(key,m);
  }
  return maskCache.get(key);
}
function buildGlyphMaskUncached(S,spec){
  const m=document.createElement("canvas");m.width=S;m.height=S;
  const g=m.getContext("2d");
  const box=S*(spec.glyphScale/100);
  const d=(spec.svgPath||"").trim();
  if(spec.uploadImg){
    const img=spec.uploadImg;
    if(!img.width||!img.height)return null;
    const sc=box/Math.max(img.width,img.height);
    const w=img.width*sc,h=img.height*sc;
    const x0=Math.round(S/2-w/2),y0=Math.round(S/2-h/2);
    g.drawImage(img,x0,y0,w,h);
    const id=g.getImageData(0,0,S,S),px=id.data;
    /* if the image itself has no real transparency, key out the background
       (sampled from the drawn image's border) — count only inside the rect */
    const x1=Math.min(S-1,x0+Math.round(w)-1),y1=Math.min(S-1,y0+Math.round(h)-1);
    let trans=0,tot=0;
    for(let y=y0;y<=y1;y+=2)for(let x=x0;x<=x1;x+=2){
      if(px[(y*S+x)*4+3]<200)trans++;tot++;
    }
    if(trans<tot*0.05){
      const lum=i=>0.299*px[i]+0.587*px[i+1]+0.114*px[i+2];
      let bl=0,bn=0;
      for(let x=x0;x<=x1;x+=3){bl+=lum((y0*S+x)*4)+lum((y1*S+x)*4);bn+=2;}
      for(let y=y0;y<=y1;y+=3){bl+=lum((y*S+x0)*4)+lum((y*S+x1)*4);bn+=2;}
      const bg=bn?bl/bn:255;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const i=(y*S+x)*4;
        px[i+3]=Math.max(0,Math.min(255,Math.abs(lum(i)-bg)*4));
      }
      g.putImageData(id,0,0);
    }
  }else if(d){
    let path;try{path=new Path2D(d);}catch(e){return null;}
    /* measure raw bounds by test-draw */
    const t=document.createElement("canvas");t.width=S;t.height=S;
    const tc=t.getContext("2d");
    tc.save();tc.translate(S*0.25,S*0.25);tc.scale(S/48,S/48);tc.fill(path);tc.restore();
    const bb=alphaBBox(tc,S);if(!bb)return null;
    const sc=box/Math.max(bb.w,bb.h);
    g.save();
    const k=(S/48)*sc;
    g.translate(S/2,S/2);g.scale(k,k);
    g.translate(-( (bb.x - S*0.25)/(S/48) + bb.w/(S/48)/2 ), -( (bb.y - S*0.25)/(S/48) + bb.h/(S/48)/2 ));
    g.fill(path);g.restore();
  }else{
    const txt=(spec.glyphText===undefined?"♥":spec.glyphText);
    if(!txt.trim())return null; /* empty = no glyph, not a default */
    /* fit the font to the box even for wide multi-character text */
    const fonts=`"Segoe UI Symbol","Segoe UI Emoji","Segoe UI",sans-serif`;
    g.font=`100px ${fonts}`;
    const mw=Math.max(g.measureText(txt).width,60);
    const fs=Math.max(8,Math.min(box*1.1,100*box/mw));
    g.font=`${Math.round(fs)}px ${fonts}`;
    g.textAlign="center";g.textBaseline="middle";
    g.fillStyle="#000";
    g.fillText(txt+"︎",S/2,S/2+box*0.04);
    let bb=alphaBBox(g,S);
    if(!bb){g.fillText(txt,S/2,S/2+box*0.04);bb=alphaBBox(g,S);if(!bb)return null;}
    /* rescale so the drawn glyph fits the box exactly, centered */
    const sc=Math.min(box/bb.w,box/bb.h);
    if(sc<0.92||sc>1.15){
      const copy=document.createElement("canvas");copy.width=S;copy.height=S;
      copy.getContext("2d").drawImage(m,0,0);
      g.clearRect(0,0,S,S);g.save();
      g.translate(S/2,S/2);g.scale(sc,sc);
      g.translate(-(bb.x+bb.w/2),-(bb.y+bb.h/2));
      g.drawImage(copy,0,0);g.restore();
    }
  }
  const data=g.getImageData(0,0,S,S).data;
  const alpha=new Uint8Array(S*S);
  for(let i=0;i<S*S;i++)alpha[i]=data[i*4+3];
  return {canvas:m,alpha,S};
}
function alphaBBox(ctx,S){
  const d=ctx.getImageData(0,0,S,S).data;
  let x0=S,y0=S,x1=-1,y1=-1;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    if(d[(y*S+x)*4+3]>20){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<0)return null;
  return {x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}
function maskAt(mask,x,y){
  const xi=x|0,yi=y|0;
  if(xi<0||yi<0||xi>=mask.S||yi>=mask.S)return 0;
  return mask.alpha[yi*mask.S+xi];
}
/* tint a mask canvas with a color, returns canvas */
function tintMask(mask,color){
  const t=document.createElement("canvas");t.width=mask.S;t.height=mask.S;
  const g=t.getContext("2d");
  g.drawImage(mask.canvas,0,0);
  g.globalCompositeOperation="source-in";
  g.fillStyle=color;g.fillRect(0,0,mask.S,mask.S);
  return t;
}

/* ---------- fur engine ---------- */
function furStroke(g,rng,x,y,ang,len,w,color){
  const bend=(rng()-0.5)*len*0.9;
  const mx=x+Math.cos(ang)*len*0.5+Math.cos(ang+Math.PI/2)*bend*0.5;
  const my=y+Math.sin(ang)*len*0.5+Math.sin(ang+Math.PI/2)*bend*0.5;
  const ex=x+Math.cos(ang)*len, ey=y+Math.sin(ang)*len;
  g.strokeStyle=color;g.lineWidth=w;g.lineCap="round";
  g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(mx,my,ex,ey);g.stroke();
}
function renderFurBody(g,S,rng,opts){
  const {path,radii,base,furLen,density,felt,contained}=opts;
  const c=S/2,k=S/512;
  const L=furLen*k*(felt?0.5:1.0);
  const lx=opts.lx===undefined?-0.55:opts.lx;    /* key light direction */
  const ly=opts.ly===undefined?-0.62:opts.ly;
  /* even velvet: strands lean toward the light with a wide random spread,
     no directional flow field (that caused visible seams/patches) */
  const flowAng=()=> -2.0 + (rng()-0.5)*2.7;
  const sample=()=>{
    const a=rng()*Math.PI*2;
    const ri=Math.floor(a/(Math.PI*2)*radii.length)%radii.length;
    const rMax=radii[ri];
    const r=Math.sqrt(rng())*rMax;
    return {x:c+Math.cos(a)*r,y:c+Math.sin(a)*r,f:rMax>0?r/rMax:0};
  };
  /* precomputed tone ramps — strand (dark roots) and lit tip (bright) —
     so we never run per-stroke colour math (keeps the dense pass fast) */
  const ST=[],TP=[];
  for(let j=0;j<13;j++){ST.push(shadeA(base,-0.16+j*0.022,0.55));
    /* matte tips — gentle lift, low alpha, so fibres don't glint like glass */
    TP.push(shadeA(base,-0.03+j*0.017,0.4));}
  /* draw fur onto a temp canvas so the whole coat can be softened at once */
  const fc=document.createElement("canvas");fc.width=S;fc.height=S;
  const fg=fc.getContext("2d");
  const bgr=fg.createRadialGradient(c,c*0.88,S*0.05,c,c,S*0.5);
  bgr.addColorStop(0,shade(base,-0.03));bgr.addColorStop(1,shade(base,-0.19));
  fg.fillStyle=bgr;fg.fill(path);
  fg.save();fg.clip(path);fg.lineCap="round";
  const total=Math.round((felt?14000:10000)*density*k*k);
  for(let i=0;i<total;i++){
    const s=sample();
    const ang=flowAng(s.x,s.y,s.f);
    const len=L*(0.5+rng()*0.7);
    const bend=(rng()-0.5)*len*0.8;
    const mx=s.x+Math.cos(ang)*len*0.5+Math.cos(ang+1.5708)*bend*0.5;
    const my=s.y+Math.sin(ang)*len*0.5+Math.sin(ang+1.5708)*bend*0.5;
    const ex=s.x+Math.cos(ang)*len, ey=s.y+Math.sin(ang)*len;
    fg.strokeStyle=ST[(2+rng()*6)|0];fg.lineWidth=1.3*k;
    fg.beginPath();fg.moveTo(s.x,s.y);fg.quadraticCurveTo(mx,my,ex,ey);fg.stroke();
    /* lit tip — brighter when the strand points toward the light */
    const align=Math.cos(ang)*lx+Math.sin(ang)*ly;
    let ti=(4+align*7+rng()*2)|0;if(ti<0)ti=0;else if(ti>12)ti=12;
    fg.fillStyle=TP[ti];fg.fillRect(ex-0.55*k,ey-0.55*k,1.2*k,1.2*k);
  }
  fg.restore();
  /* soften: blurred coat + a sharper overlay, so strands read as fibre not ink */
  g.save();g.filter=`blur(${0.9*k}px)`;g.drawImage(fc,0,0);g.restore();
  g.globalAlpha=0.55;g.drawImage(fc,0,0);g.globalAlpha=1;
  /* clean trimmed edge (like a finished tuft — the pile is cut flush to
     the shape, not left with strands standing out). A directional rim,
     lit on the top-left, in shadow on the bottom-right, defines the edge. */
  g.save();g.clip(path);
  const eg=g.createLinearGradient(S/2+lx*S*0.42,S/2+ly*S*0.42,S/2-lx*S*0.42,S/2-ly*S*0.42);
  eg.addColorStop(0,"rgba(255,253,248,0.13)");
  eg.addColorStop(0.42,"rgba(255,253,248,0.02)");
  eg.addColorStop(0.58,"rgba(0,0,0,0.06)");
  eg.addColorStop(1,"rgba(0,0,0,0.42)");
  g.strokeStyle=eg;g.lineWidth=7*k;g.stroke(path);
  /* a thin darker cut-line right at the trimmed edge for crisp definition */
  g.strokeStyle="rgba(0,0,0,0.22)";g.lineWidth=2*k;g.stroke(path);
  g.restore();
}
function applyLighting(g,S,sheen,lx,ly,puff){
  const f=sheen===undefined?1:sheen;
  const p=puff===undefined?1:puff;                 /* puffiness */
  lx=lx===undefined?-0.55:lx; ly=ly===undefined?-0.62:ly;
  g.globalCompositeOperation="source-atop";
  /* MATTE diffuse shading — wool scatters light, so a broad soft gradient
     brighter toward the light and darker away from it, with NO concentrated
     glossy hotspot (that read as shiny glass). */
  let gr=g.createLinearGradient(S/2+lx*S*0.55,S/2+ly*S*0.55,S/2-lx*S*0.55,S/2-ly*S*0.55);
  gr.addColorStop(0,`rgba(255,253,248,${0.13*f*p})`);
  gr.addColorStop(0.45,`rgba(255,253,248,${0.02*f})`);
  gr.addColorStop(0.62,`rgba(0,0,0,${0.05*p})`);
  gr.addColorStop(1,`rgba(0,0,0,${Math.min(0.7,0.46*p)})`);
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  /* very soft, broad central lift (the crown of the pile), low intensity */
  gr=g.createRadialGradient(S*(0.5+lx*0.14),S*(0.5+ly*0.14),S*0.10,S*0.5,S*0.5,S*0.62);
  gr.addColorStop(0,`rgba(255,253,248,${0.07*f*p})`);
  gr.addColorStop(1,"rgba(255,253,248,0)");
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  /* soft edge ambient-occlusion ring so it seats like a rounded pad */
  gr=g.createRadialGradient(S*0.5,S*0.5,S*0.34,S*0.5,S*0.5,S*0.52);
  gr.addColorStop(0,"rgba(0,0,0,0)");gr.addColorStop(1,`rgba(0,0,0,${0.26*p})`);
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  g.globalCompositeOperation="source-over";
}

/* ---------- glyph finishes ---------- */
function drawGlyphFlocked(g,S,rng,mask,color,furLen,density){
  const k=S/512,L=furLen*k*0.45;
  const bb=mask.bbox||{x:0,y:0,w:S,h:S};
  /* pressed-in shadow so the patch nests into the coat */
  g.save();g.filter=`blur(${4*k}px)`;g.globalAlpha=0.30;
  g.drawImage(tintMask(mask,"rgb(40,20,8)"),1.5*k,3*k);
  g.restore();
  /* solid soft core so the body colour never shows through the fur */
  g.save();g.filter=`blur(${3*k}px)`;g.globalAlpha=0.75;
  g.drawImage(tintMask(mask,shade(color,-0.05)),0,0);
  g.restore();
  const N=Math.round(bb.w*bb.h/(S*S)*60000*density);
  const passes=[
    {dl:-0.08,a:0.5,len:1.0 ,w:2.2},
    {dl:+0.03,a:0.5,len:0.8 ,w:1.8},
    {dl:+0.12,a:0.5,len:0.55,w:1.2}
  ];
  for(const p of passes){
    for(let i=0;i<N/3;i++){
      const x=bb.x+rng()*bb.w, y=bb.y+rng()*bb.h;
      if(maskAt(mask,x,y)<110)continue;
      furStroke(g,rng,x,y,rng()*Math.PI*2,L*p.len*(0.6+rng()*0.6),p.w*k,
        shadeA(color,p.dl+(rng()-0.5)*0.07,p.a));
    }
  }
  /* stray hairs past the silhouette keep the edge fuzzy, not stamped */
  for(let i=0;i<N*0.12;i++){
    const x=bb.x+rng()*bb.w, y=bb.y+rng()*bb.h;
    if(maskAt(mask,x,y)<110)continue;
    if(maskAt(mask,x+4*k,y)>110&&maskAt(mask,x-4*k,y)>110&&
       maskAt(mask,x,y+4*k)>110&&maskAt(mask,x,y-4*k)>110)continue;
    furStroke(g,rng,x,y,rng()*Math.PI*2,L*(0.8+rng()*0.6),1.4*k,
      shadeA(color,(rng()-0.5)*0.10,0.55));
  }
}
function drawGlyphStitched(g,S,rng,mask,color){
  const k=S/512;
  /* soft indent shadow under the stitching */
  g.save();g.globalAlpha=0.30;
  g.drawImage(tintMask(mask,"rgba(30,15,5,1)"),1.5*k,2.5*k);
  g.restore();
  /* solid satin underlay so stitches read as thick embroidery, not speckle */
  g.save();g.globalAlpha=0.85;
  g.drawImage(tintMask(mask,shade(color,-0.10)),0,0);g.restore();
  const step=2.6*k,ang=-Math.PI/4,len=3.8*k;
  const bb=mask.bbox||{x:0,y:0,w:S,h:S};
  for(let y=bb.y;y<bb.y+bb.h;y+=step){
    for(let x=bb.x;x<bb.x+bb.w;x+=step){
      const jx=x+(rng()-0.5)*step, jy=y+(rng()-0.5)*step;
      if(maskAt(mask,jx,jy)<110)continue;
      const a=ang+(rng()-0.5)*0.25, l=len*(0.8+rng()*0.5);
      g.strokeStyle=shadeA(color,(rng()-0.5)*0.12,0.9);
      g.lineWidth=1.8*k;g.lineCap="round";
      g.beginPath();
      g.moveTo(jx-Math.cos(a)*l/2,jy-Math.sin(a)*l/2);
      g.lineTo(jx+Math.cos(a)*l/2,jy+Math.sin(a)*l/2);
      g.stroke();
    }
  }
}
/* raised satin embroidery — silver fill, directional emboss, soft threads */
function drawGlyphSatin(g,S,rng,mask,color){
  const k=S/512;
  /* raised drop shadow */
  g.save();g.globalAlpha=0.55;g.filter=`blur(${2.5*k}px)`;
  g.drawImage(tintMask(mask,"rgb(3,2,1)"),1*k,3.5*k);g.restore();
  /* base fill */
  g.drawImage(tintMask(mask,color),0,0);
  /* directional emboss: highlight top-left, shade bottom-right */
  g.globalCompositeOperation="source-atop";
  g.globalAlpha=0.5;g.drawImage(tintMask(mask,"rgb(255,255,250)"),-1.5*k,-1.5*k);
  g.globalAlpha=0.42;g.drawImage(tintMask(mask,"rgb(38,34,30)"),1.5*k,1.9*k);
  g.globalCompositeOperation="source-over";g.globalAlpha=1;
  /* subtle satin threads, clipped to the glyph */
  const t=document.createElement("canvas");t.width=S;t.height=S;
  const tg=t.getContext("2d");
  tg.save();tg.translate(S/2,S/2);tg.rotate(-0.5);
  for(let y=-S;y<S;y+=3*k){
    tg.strokeStyle=(Math.round(y/(3*k))%2===0)?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.09)";
    tg.lineWidth=1.4*k;tg.beginPath();tg.moveTo(-S,y);tg.lineTo(S,y);tg.stroke();
  }
  tg.restore();
  tg.globalCompositeOperation="destination-in";tg.drawImage(mask.canvas,0,0);
  g.drawImage(t,0,0);
}
/* short fur strands tufting over an embroidered glyph's edge, so it reads
   as embedded in the pile rather than stamped on top */
function furFringe(g,S,rng,mask,base){
  const k=S/512,bb=mask.bbox;if(!bb)return;
  const n=Math.round(bb.w*bb.h/(S*S)*9000);
  const d=5*k;
  for(let i=0;i<n;i++){
    const x=bb.x+rng()*bb.w,y=bb.y+rng()*bb.h;
    if(maskAt(mask,x,y)<128)continue;
    if(maskAt(mask,x+d,y)>128&&maskAt(mask,x-d,y)>128&&
       maskAt(mask,x,y+d)>128&&maskAt(mask,x,y-d)>128)continue;
    furStroke(g,rng,x,y,rng()*Math.PI*2,(3.5+rng()*5)*k,1.0*k,
      shadeA(base,0.06+(rng()-0.5)*0.12,0.7));
  }
}
/* soft translucent shape, like frosted glass clouds */
function drawGlyphFrosted(g,S,rng,mask,color){
  const k=S/512;
  g.save();g.filter=`blur(${5*k}px)`;g.globalAlpha=0.30;
  g.drawImage(tintMask(mask,"rgb(60,40,100)"),2*k,4*k);g.restore();
  g.save();g.filter=`blur(${0.6*k}px)`;g.globalAlpha=0.95;
  g.drawImage(tintMask(mask,color),0,0);g.restore();
  const t=document.createElement("canvas");t.width=S;t.height=S;
  const tg=t.getContext("2d");
  tg.drawImage(mask.canvas,0,0);tg.globalCompositeOperation="source-in";
  const gr=tg.createLinearGradient(0,S*0.30,0,S*0.70);
  gr.addColorStop(0,"rgba(255,255,255,0.50)");gr.addColorStop(1,"rgba(255,255,255,0)");
  tg.fillStyle=gr;tg.fillRect(0,0,S,S);
  g.drawImage(t,0,0);
}
function drawGlyphRaised(g,S,rng,mask,color){
  const k=S/512;
  /* drop shadow */
  g.save();g.globalAlpha=0.35;
  g.drawImage(tintMask(mask,"rgb(30,15,5)"),0,3.5*k);g.restore();
  /* highlight rim (peeks out above) */
  g.save();g.globalAlpha=0.9;
  g.drawImage(tintMask(mask,shade(color,+0.28)),0,-2*k);g.restore();
  /* body */
  g.drawImage(tintMask(mask,color),0,0);
  /* subtle top-lit gradient inside glyph */
  const t=document.createElement("canvas");t.width=S;t.height=S;
  const tg=t.getContext("2d");
  tg.drawImage(mask.canvas,0,0);
  tg.globalCompositeOperation="source-in";
  const gr=tg.createLinearGradient(0,S*0.25,0,S*0.75);
  gr.addColorStop(0,"rgba(255,255,255,0.25)");gr.addColorStop(1,"rgba(40,20,10,0.18)");
  tg.fillStyle=gr;tg.fillRect(0,0,S,S);
  g.drawImage(t,0,0);
}

/* ---------- glass / jelly bodies ---------- */
function shapeMetrics(type,S){
  const c=S/2;
  if(type==="circle"){const r=S*0.335;return{x:c-r,y:c-r,w:2*r,h:2*r};}
  if(type==="pill"){const w=S*0.78,h=S*0.40;return{x:c-w/2,y:c-h/2,w,h};}
  const w=S*0.70;return{x:c-w/2,y:c-w/2,w,h:w};
}
/* the glass block casts a shadow; a taller (thicker) block floats higher and
   throws a larger, softer, more offset shadow — plus its coloured light-glow */
function glassLightShadow(g,S,path,tint,thick){
  const t=thick===undefined?1:thick;
  g.save();
  /* dark cast shadow — grows and drops further as thickness rises */
  g.filter=`blur(${S*0.03*(1+0.6*t)}px)`;g.globalAlpha=0.34;
  g.fillStyle="rgb(22,16,34)";
  g.save();g.translate(0,S*0.018*t);g.fill(path);g.restore();
  /* soft coloured glow (light passing through tints the shadow) */
  g.filter=`blur(${S*0.055}px)`;g.globalAlpha=0.5;
  g.fillStyle=shade(tint,+0.06);
  g.save();g.translate(0,S*0.03);g.scale(1,0.97);g.fill(path);g.restore();
  g.restore();
}
/* THICKNESS = height of the glass slab, shown as a 3D beveled edge-wall.
   The wall (band between the outer edge and the inner top surface) is filled
   with a chamfer gradient — lit on the top-left, dark on the bottom-right —
   so a thicker slab shows a taller wall rising up, not a spreading frame. */
function glassThickness(g,S,path,m,k,lx,ly,thick,clarity){
  const cx=S/2,cy=S/2,t=thick===undefined?1:thick;
  const cl=clarity===undefined?0.5:clarity;
  const wa=1-cl*0.72;                        /* clear glass → much fainter wall */
  lx=lx===undefined?-0.55:lx; ly=ly===undefined?-0.62:ly;
  const bevel=(0.07+0.05*t)*(1-cl*0.35);     /* clear glass → thinner edge */
  const inset=1-bevel;
  g.save();g.clip(path);
  /* caustic — light focuses through the lens on the side opposite the light */
  g.save();g.filter=`blur(${4*k}px)`;
  const ccx=cx-lx*m.w*0.22, ccy=m.y+m.h*(0.5-ly*0.32);
  const cg=g.createRadialGradient(ccx,ccy,S*0.02,ccx,ccy,m.w*0.55);
  cg.addColorStop(0,`rgba(255,255,255,${0.34*(1-cl*0.4)})`);cg.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=cg;g.fillRect(0,0,S,S);g.filter="none";g.restore();
  /* the beveled wall: fill the ring between outer edge and inner surface.
     Faint & refractive on clear glass, solid chamfer on tinted glass. */
  const inner=new DOMMatrix().translateSelf(cx,cy).scaleSelf(inset,inset).translateSelf(-cx,-cy);
  const ring=new Path2D();ring.addPath(path);ring.addPath(path,inner);
  let wg=g.createLinearGradient(S/2+lx*m.w*0.55,S/2+ly*m.h*0.55,S/2-lx*m.w*0.55,S/2-ly*m.h*0.55);
  wg.addColorStop(0,`rgba(255,255,255,${0.85*wa})`);   /* lit top face */
  wg.addColorStop(0.42,`rgba(255,255,255,${0.12*wa})`);
  wg.addColorStop(0.6,`rgba(0,0,0,${0.1*wa})`);
  wg.addColorStop(1,`rgba(18,12,32,${0.5*wa})`);        /* under-lit shadow face */
  g.fillStyle=wg;g.fill(ring,"evenodd");
  /* crisp top ridge (outer) and a bright inner-surface edge */
  g.strokeStyle="rgba(255,255,255,0.55)";g.lineWidth=2.2*k;g.stroke(path);
  g.save();g.translate(cx,cy);g.scale(inset,inset);g.translate(-cx,-cy);
  g.strokeStyle="rgba(255,255,255,0.6)";g.lineWidth=2*k;g.stroke(path);
  g.strokeStyle="rgba(8,6,18,0.2)";g.lineWidth=1.4*k;g.stroke(path);
  g.restore();
  /* glossy border highlight — a bright sweep along the light-side edge */
  let hg=g.createLinearGradient(S/2+lx*m.w*0.55,S/2+ly*m.h*0.55,S/2-lx*m.w*0.2,S/2-ly*m.h*0.2);
  hg.addColorStop(0,"rgba(255,255,255,0.95)");
  hg.addColorStop(0.4,"rgba(255,255,255,0.2)");
  hg.addColorStop(1,"rgba(255,255,255,0)");
  g.strokeStyle=hg;g.lineWidth=3.2*k;g.stroke(path);
  g.restore();
}
function glassGloss(g,S,path,m,k,lx,ly,frost){
  lx=lx===undefined?-0.55:lx; ly=ly===undefined?-0.62:ly;
  const fr=frost===undefined?0:frost;
  g.save();g.clip(path);
  const gx=m.x+m.w*(0.5+lx*0.24), gy=m.y+m.h*(0.13+Math.max(0,-ly-0.3)*0.1);
  /* broad top sheen (softer when frosted) */
  const gl=g.createLinearGradient(0,m.y+m.h*0.02,0,m.y+m.h*0.30);
  gl.addColorStop(0,`rgba(255,255,255,${0.62*(1-0.5*fr)})`);gl.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=gl;
  g.beginPath();g.ellipse(m.x+m.w*0.5,m.y+m.h*0.14,m.w*0.44,m.h*0.12,0,0,Math.PI*2);g.fill();
  /* crisp wet specular streak — a bright hard highlight near the top-light */
  g.filter=`blur(${(0.5+5*fr)*k}px)`;
  g.fillStyle=`rgba(255,255,255,${(1-0.85*fr)})`;
  g.beginPath();g.ellipse(gx,gy,m.w*0.14,m.h*0.05,-0.5,0,Math.PI*2);g.fill();
  g.beginPath();g.ellipse(gx-m.w*0.05,gy-m.h*0.02,m.w*0.05,m.h*0.028,-0.5,0,Math.PI*2);g.fill();
  g.filter="none";
  g.restore();
}
/* frosted / ground-glass veil — milky, diffuse; more frost = more opaque-milky */
function glassFrost(g,S,path,m,k,frost){
  if(!frost||frost<=0.01)return;
  g.save();g.clip(path);
  const fg=g.createLinearGradient(0,m.y,0,m.y+m.h);
  fg.addColorStop(0,`rgba(252,253,255,${0.6*frost})`);
  fg.addColorStop(1,`rgba(238,242,249,${0.46*frost})`);
  g.fillStyle=fg;g.fillRect(0,0,S,S);
  g.restore();
}
function renderGlassBody(g,S,path,cA,cB,cC,mode,shape,lx,ly,thick,clarity,frost){
  const k=S/512,m=shapeMetrics(shape,S);
  const cl=clarity===undefined?0.5:clarity, jelly=mode==="jelly";
  const bodyA=jelly?0.95:(0.03+(1-cl)*0.94);   /* glass: fully clear (0.03) … fully solid (0.97) */
  glassLightShadow(g,S,path,cB,thick);
  g.save();
  g.shadowColor="rgba(25,18,35,0.35)";g.shadowBlur=S*0.035;g.shadowOffsetY=S*0.02;
  g.fillStyle=jelly?shadeA(cB,0,0.92):shadeA(cB,+0.04,Math.min(0.4,bodyA*0.55));
  g.fill(path);
  g.restore();
  g.save();g.clip(path);
  /* vertical depth tint blending the three chosen colours */
  let lg=g.createLinearGradient(0,m.y,0,m.y+m.h);
  if(jelly){
    lg.addColorStop(0,shadeA(cA,+0.10,0.95));
    lg.addColorStop(0.55,shadeA(cB,+0.02,0.55));
    lg.addColorStop(1,shadeA(cC,-0.08,0.85));
  }else{
    lg.addColorStop(0,shadeA(cA,+0.12,bodyA));
    lg.addColorStop(0.55,shadeA(cB,+0.04,Math.min(1,bodyA*0.82)));
    lg.addColorStop(1,shadeA(cC,-0.05,Math.min(1,bodyA*1.05)));
  }
  g.fillStyle=lg;g.fillRect(0,0,S,S);
  /* convex dome: a bright crown toward the light + a darker rim, so the
     button bulges. Crown fades on clear glass; rim stays subtle. */
  const dg=g.createRadialGradient(S*(0.5+lx*0.12),m.y+m.h*0.32,S*0.02,S/2,S/2,m.w*0.62);
  dg.addColorStop(0,`rgba(255,255,255,${0.18*bodyA})`);
  dg.addColorStop(0.55,"rgba(255,255,255,0)");
  dg.addColorStop(1,`rgba(0,0,0,${0.10+0.16*bodyA})`);
  g.fillStyle=dg;g.fillRect(0,0,S,S);
  g.restore();
  glassFrost(g,S,path,m,k,frost);
  glassThickness(g,S,path,m,k,lx,ly,thick,cl);
  glassGloss(g,S,path,m,k,lx,ly,frost);
}
/* vivid gradient glass — tri-colour body, wave layers, thick luminous rim */
function renderVividGlass(g,S,rng,path,shape,cA,cB,cC,lx,ly,thick,clarity,frost){
  const k=S/512,m=shapeMetrics(shape,S);
  const cl=clarity===undefined?0.5:clarity;
  const va=0.1+(1-cl)*0.87;                  /* vivid: near-clear … opaque */
  glassLightShadow(g,S,path,cB,thick);
  /* deep soft shadow */
  g.save();
  g.shadowColor="rgba(60,40,100,0.45)";g.shadowBlur=S*0.05;g.shadowOffsetY=S*0.028;
  g.fillStyle=shadeA(cB,0,va);g.fill(path);
  g.restore();
  g.save();g.clip(path);
  /* vivid tri-colour gradient, slightly diagonal */
  let lg=g.createLinearGradient(m.x+m.w*0.15,m.y,m.x+m.w*0.55,m.y+m.h);
  lg.addColorStop(0,shadeA(cA,0,va));lg.addColorStop(0.5,shadeA(cB,0,va));lg.addColorStop(1,shadeA(cC,0,va));
  g.fillStyle=lg;g.fillRect(0,0,S,S);
  /* core + waves fade out as the glass clears, so a clear icon shows the
     background through it instead of a milky coloured interior */
  g.globalAlpha=va;
  /* luminous core */
  const rg=g.createRadialGradient(m.x+m.w*0.42,m.y+m.h*0.30,S*0.02,
                                  m.x+m.w*0.42,m.y+m.h*0.30,m.w*0.70);
  rg.addColorStop(0,"rgba(255,255,255,0.30)");rg.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=rg;g.fillRect(0,0,S,S);
  /* translucent wave layers */
  const waves=[
    {y:0.52,amp:0.050,a1:"rgba(255,255,255,0.40)",a2:"rgba(255,255,255,0.06)"},
    {y:0.66,amp:0.060,a1:shadeA(cB,+0.10,0.45),   a2:shadeA(cC,+0.05,0.10)},
    {y:0.80,amp:0.045,a1:"rgba(255,255,255,0.30)",a2:"rgba(255,255,255,0.04)"}
  ];
  for(const wv of waves){
    const ph=rng()*Math.PI*2,yb=m.y+m.h*wv.y,amp=m.h*wv.amp;
    g.beginPath();g.moveTo(m.x-10*k,yb);
    for(let x=m.x-10*k;x<=m.x+m.w+10*k;x+=6*k)
      g.lineTo(x,yb+Math.sin(x/(m.w*0.28)+ph)*amp);
    g.lineTo(m.x+m.w+10*k,m.y+m.h+10*k);
    g.lineTo(m.x-10*k,m.y+m.h+10*k);g.closePath();
    const wg=g.createLinearGradient(0,yb-amp,0,m.y+m.h);
    wg.addColorStop(0,wv.a1);wg.addColorStop(1,wv.a2);
    g.fillStyle=wg;g.fill();
  }
  g.restore();
  glassFrost(g,S,path,m,k,frost);
  glassThickness(g,S,path,m,k,lx,ly,thick,cl);
  glassGloss(g,S,path,m,k,lx,ly,frost);
}
/* glass case over a fur body */
function glassOverlay(g,S,path,shape){
  const k=S/512,m=shapeMetrics(shape,S);
  g.save();g.clip(path);
  g.fillStyle="rgba(255,255,255,0.07)";g.fillRect(0,0,S,S);
  let lg=g.createLinearGradient(0,m.y,0,m.y+m.h);
  lg.addColorStop(0,"rgba(255,255,255,0.80)");
  lg.addColorStop(0.4,"rgba(255,255,255,0.12)");
  lg.addColorStop(1,"rgba(255,255,255,0.85)");
  g.strokeStyle=lg;g.lineWidth=5*k;g.stroke(path);
  lg=g.createLinearGradient(0,m.y+m.h*0.05,0,m.y+m.h*0.40);
  lg.addColorStop(0,"rgba(255,255,255,0.50)");lg.addColorStop(1,"rgba(255,255,255,0.02)");
  g.fillStyle=lg;
  g.beginPath();g.ellipse(m.x+m.w/2,m.y+m.h*0.20,m.w*0.38,m.h*0.15,0,0,Math.PI*2);g.fill();
  g.restore();
}

/* ---------- clay body ---------- */
function renderClayBody(g,S,path,base){
  const c=S/2;
  g.save();
  g.shadowColor="rgba(40,25,10,0.30)";g.shadowBlur=S*0.03;g.shadowOffsetY=S*0.012;
  const gr=g.createLinearGradient(0,c-S*0.35,0,c+S*0.35);
  gr.addColorStop(0,shade(base,+0.07));gr.addColorStop(1,shade(base,-0.06));
  g.fillStyle=gr;g.fill(path);
  g.restore();
  /* inner bottom shade + top sheen */
  g.save();g.clip(path);
  let rg=g.createRadialGradient(c,c+S*0.1,S*0.1,c,c+S*0.15,S*0.42);
  rg.addColorStop(0,"rgba(40,25,10,0)");rg.addColorStop(1,"rgba(40,25,10,0.16)");
  g.fillStyle=rg;g.fillRect(0,0,S,S);
  rg=g.createRadialGradient(c-S*0.12,c-S*0.16,S*0.02,c-S*0.12,c-S*0.16,S*0.4);
  rg.addColorStop(0,"rgba(255,255,250,0.35)");rg.addColorStop(1,"rgba(255,255,250,0)");
  g.fillStyle=rg;g.fillRect(0,0,S,S);
  g.restore();
}

/* ---------- backgrounds ---------- */
function renderBackground(g,S,rng,spec){
  if(spec.bg==="transparent")return;
  const bg=spec.bgColor;
  if(spec.bg==="solid"){g.fillStyle=bg;g.fillRect(0,0,S,S);return;}
  if(spec.bg==="aurora"){ /* pastel multi-hue wash */
    const [r0,g0,b0]=hexToRgb(bg);const [h,s]=rgbToHsl(r0,g0,b0);
    const [rr,gg2,bb2]=hslToRgb(h,Math.min(1,s*0.6),0.88);
    g.fillStyle=`rgb(${rr},${gg2},${bb2})`;g.fillRect(0,0,S,S);
    const offs=[-0.12,-0.05,0.04,0.10,0.18,0.28];
    for(const o of offs){
      const [cr,cg,cb]=hslToRgb(h+o,Math.min(1,s*0.9+0.15),0.76);
      const x=rng()*S,y=rng()*S,r=S*(0.28+rng()*0.30);
      const bl=g.createRadialGradient(x,y,0,x,y,r);
      bl.addColorStop(0,`rgba(${cr},${cg},${cb},0.55)`);
      bl.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);
      g.fillStyle=bl;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    }
    return;
  }
  /* bokeh */
  const gr=g.createLinearGradient(0,0,0,S);
  gr.addColorStop(0,shade(bg,+0.06));gr.addColorStop(1,shade(bg,-0.05));
  g.fillStyle=gr;g.fillRect(0,0,S,S);
  for(let i=0;i<10;i++){
    const x=rng()*S,y=rng()*S,r=S*(0.04+rng()*0.10);
    const b=g.createRadialGradient(x,y,0,x,y,r);
    b.addColorStop(0,shadeA(bg,+0.10,0.35));b.addColorStop(1,shadeA(bg,+0.10,0));
    g.fillStyle=b;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
  }
}

/* ---------- main render ---------- */
const radiiCache=new Map();
function renderIcon(ctx,S,spec){
  const rng=mulberry32(spec.seed>>>0 || 1);
  ctx.clearRect(0,0,S,S);
  renderBackground(ctx,S,rng,spec);

  /* ambient contact shadow */
  if(spec.bg!=="transparent"){
    ctx.save();
    ctx.translate(S/2,S/2+S*0.30);
    ctx.scale(1,0.35);
    const sg=ctx.createRadialGradient(0,0,0,0,0,S*0.30);
    sg.addColorStop(0,"rgba(40,20,8,0.28)");sg.addColorStop(1,"rgba(40,20,8,0)");
    ctx.fillStyle=sg;
    ctx.beginPath();ctx.arc(0,0,S*0.30,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  /* body on offscreen so lighting composites only onto it */
  const off=document.createElement("canvas");off.width=S;off.height=S;
  const g=off.getContext("2d");
  const path=shapePath(spec.shape,S);
  const rkey=spec.shape+"|"+S;
  if(!radiiCache.has(rkey))radiiCache.set(rkey,boundaryRadii(g,path,S,180));
  const radii=radiiCache.get(rkey);

  /* one light source drives every material (angle in degrees, 225 = top-left) */
  const la=(spec.light===undefined?225:spec.light)*Math.PI/180;
  const lx=Math.cos(la), ly=Math.sin(la);
  const thick=spec.glassThick===undefined?1:spec.glassThick;
  const puff=spec.puff===undefined?1:spec.puff;
  const clarity=spec.clarity===undefined?0.5:spec.clarity;   /* 0 opaque … 1 clear */
  const frost=spec.frost===undefined?0:spec.frost;           /* 0 clear … 1 milky */

  if(spec.style==="clay"){
    renderClayBody(g,S,path,spec.baseColor);
  }else if(spec.style==="vividglass"){
    renderVividGlass(g,S,rng,path,spec.shape,spec.baseColor,spec.colorB,spec.colorC,lx,ly,thick,clarity,frost);
  }else if(spec.style==="glass"||spec.style==="jelly"){
    renderGlassBody(g,S,path,spec.baseColor,spec.colorB,spec.colorC,spec.style,spec.shape,lx,ly,thick,clarity,frost);
  }else{
    const contained=spec.style==="furglass";
    renderFurBody(g,S,rng,{path,radii,base:spec.baseColor,
      furLen:spec.furLen*(contained?0.8:1),density:spec.density,
      felt:spec.style==="felt",contained,lx,ly});
    applyLighting(g,S,spec.sheen,lx,ly,puff);
    if(contained)glassOverlay(g,S,path,spec.shape);
  }

  /* glyph */
  const mask=buildGlyphMask(S,spec);
  if(mask){
    if(spec.glyphStyle==="frosted"){
      drawGlyphFrosted(g,S,rng,mask,spec.glyphColor);
    }else if(["clay","glass","jelly","vividglass"].includes(spec.style)&&spec.glyphStyle==="flocked"){
      drawGlyphRaised(g,S,rng,mask,spec.glyphColor); /* flocked reads poorly on smooth bodies */
    }else if(spec.glyphStyle==="flocked"){
      drawGlyphFlocked(g,S,rng,mask,spec.glyphColor,spec.furLen,spec.density);
    }else if(spec.glyphStyle==="satin"){
      drawGlyphSatin(g,S,rng,mask,spec.glyphColor);
    }else if(spec.glyphStyle==="stitched"){
      drawGlyphStitched(g,S,rng,mask,spec.glyphColor);
    }else{
      drawGlyphRaised(g,S,rng,mask,spec.glyphColor);
    }
    if((spec.glyphStyle==="satin"||spec.glyphStyle==="stitched")&&
       (spec.style==="fluffy"||spec.style==="felt"))
      furFringe(g,S,rng,mask,spec.baseColor);
  }
  /* overall Transparency — fades the whole icon (body+glyph) so it is
     genuinely see-through over whatever sits behind it in the app */
  const iconA=spec.transp===undefined?0:spec.transp;
  ctx.save();ctx.globalAlpha=Math.max(0,1-iconA);ctx.drawImage(off,0,0);ctx.restore();
}
/* apply a recipe object onto a state/spec target */
function applySpec(sp,target){
  if(Array.isArray(sp.colors)){
    if(sp.colors[0])target.baseColor=sp.colors[0];
    if(sp.colors[1])target.colorB=sp.colors[1];
    if(sp.colors[2])target.colorC=sp.colors[2];
  }
  for(const k of ["style","shape","glyphStyle","bg","baseColor","colorB","colorC",
    "glyphColor","bgColor","glyphText","svgPath","glyphScale","furLen","density","seed",
    "light","glassThick","puff","clarity","frost","transp"])
    if(sp[k]!==undefined)target[k]=sp[k];
  if(sp.glyph!==undefined)target.glyphText=sp.glyph;
  return target;
}

