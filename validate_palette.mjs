// Chart-series checker: CVD separation between series + contrast vs surface.
const hex = h => { const n = parseInt(h.replace('#',''),16);
  return [(n>>16)&255,(n>>8)&255,n&255]; };
const lin = c => { c/=255; return c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
const lum = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const contrast = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);
  return (x+0.05)/(y+0.05); };

function lab(rgb){
  const [r,g,b] = rgb.map(lin);
  let X = (0.4124*r+0.3576*g+0.1805*b)/0.95047;
  let Y = (0.2126*r+0.7152*g+0.0722*b);
  let Z = (0.0193*r+0.1192*g+0.9505*b)/1.08883;
  const f = t => t>0.008856 ? Math.cbrt(t) : (7.787*t)+16/116;
  [X,Y,Z]=[f(X),f(Y),f(Z)];
  return [116*Y-16, 500*(X-Y), 200*(Y-Z)];
}
// CIEDE2000 — the metric the palette block's recorded figures use.
function de00(rgbA, rgbB){
  const [L1,a1,b1]=lab(rgbA), [L2,a2,b2]=lab(rgbB);
  const rad=Math.PI/180, deg=180/Math.PI;
  const C1=Math.hypot(a1,b1), C2=Math.hypot(a2,b2), Cb=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const A1=(1+G)*a1, A2=(1+G)*a2;
  const Cp1=Math.hypot(A1,b1), Cp2=Math.hypot(A2,b2);
  let h1=Math.atan2(b1,A1)*deg; if(h1<0)h1+=360;
  let h2=Math.atan2(b2,A2)*deg; if(h2<0)h2+=360;
  const dL=L2-L1, dC=Cp2-Cp1;
  let dh=0;
  if(Cp1*Cp2!==0){ dh=h2-h1; if(dh>180)dh-=360; else if(dh<-180)dh+=360; }
  const dH=2*Math.sqrt(Cp1*Cp2)*Math.sin(dh/2*rad);
  const Lb=(L1+L2)/2, Cpb=(Cp1+Cp2)/2;
  let hb;
  if(Cp1*Cp2===0) hb=h1+h2;
  else { hb=(h1+h2)/2; if(Math.abs(h1-h2)>180) hb += (h1+h2<360)?180:-180; }
  const T=1-0.17*Math.cos((hb-30)*rad)+0.24*Math.cos(2*hb*rad)
          +0.32*Math.cos((3*hb+6)*rad)-0.20*Math.cos((4*hb-63)*rad);
  const dTh=30*Math.exp(-(((hb-275)/25)**2));
  const Rc=2*Math.sqrt(Cpb**7/(Cpb**7+25**7));
  const Sl=1+(0.015*(Lb-50)**2)/Math.sqrt(20+(Lb-50)**2);
  const Sc=1+0.045*Cpb, Sh=1+0.015*Cpb*T;
  const Rt=-Math.sin(2*dTh*rad)*Rc;
  return Math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh));
}

// Viénot-Brettel-Mollon dichromat simulation (LMS, sRGB-linear)
function cvd(rgb, type){
  const [r,g,b] = rgb.map(lin);
  const L = 17.8824*r + 43.5161*g + 4.11935*b;
  const M = 3.45565*r + 27.1554*g + 3.86714*b;
  const S = 0.0299566*r + 0.184309*g + 1.46709*b;
  let l=L,m=M,s=S;
  if (type==='protan')  l = 2.02344*M - 2.52581*S;
  if (type==='deutan')  m = 0.494207*L + 1.24827*S;
  if (type==='tritan')  s = -0.395913*L + 0.801109*M;
  let R =  0.080944*l - 0.130504*m + 0.116721*s;
  let G = -0.010248*l + 0.054019*m - 0.113614*s;
  let B = -0.000365*l - 0.004122*m + 0.693513*s;
  const un = c => { c = Math.max(0,Math.min(1,c));
    return Math.round(255*(c<=0.0031308 ? 12.92*c : 1.055*c**(1/2.4)-0.055)); };
  return [un(R),un(G),un(B)];
}

const SURFACE = hex(process.argv[3] || '#101018');
const series = (process.argv[2]||'').split(',').filter(Boolean).map(s=>s.trim());

console.log(`surface ${process.argv[3]||'#101018'}\n`);
for (const s of series){
  const c = contrast(hex(s), SURFACE);
  console.log(`  ${s}  contrast vs surface ${c.toFixed(2)}:1  ${c>=3 ? 'PASS' : 'FAIL (<3:1)'}`);
}
console.log('');
let worst = {de: Infinity};
for (let i=0;i<series.length;i++) for (let j=i+1;j<series.length;j++){
  const A=hex(series[i]), B=hex(series[j]);
  for (const t of ['normal','deutan','protan','tritan']){
    const a = t==='normal'?A:cvd(A,t), b = t==='normal'?B:cvd(B,t);
    const d = de00(a,b);
    if (d < worst.de) worst = {de:d, pair:`${series[i]}/${series[j]}`, t};
    console.log(`  ${series[i]} vs ${series[j]}  ${t.padEnd(7)} ΔE00 ${d.toFixed(1)}  ${d>=8?'PASS':'FAIL (<8)'}`);
  }
}
console.log(`\n  worst: ${worst.pair} under ${worst.t} — ΔE ${worst.de.toFixed(1)}`);
