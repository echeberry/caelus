(function(){
"use strict";
const D=Math.PI/180;
const sind=a=>Math.sin(a*D), cosd=a=>Math.cos(a*D);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const asind=x=>Math.asin(clamp(x,-1,1))/D, acosd=x=>Math.acos(clamp(x,-1,1))/D;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num=v=>typeof v==="number"&&isFinite(v);
const STORE="localdome.v1";
const CAMBRIDGE={name:"Cambridge, MA (Harvard Yard)",lat:42.375,lon:-71.1167,tz:"America/New_York"};

const STARS=[["Polaris",89.38],["Dubhe",61.65],["Capella",46.02],["Deneb",45.37],["Vega",38.80],["Pollux",27.97],["Arcturus",19.05],["Aldebaran",16.55],["Regulus",11.83],["Altair",8.93],["Betelgeuse",7.41],["Procyon",5.16],["Rigel",-8.17],["Spica",-11.30],["Sirius",-16.75],["Antares",-26.48],["Fomalhaut",-29.48],["Canopus",-52.71],["Achernar",-57.10]];
const starDec=name=>{const s=STARS.find(x=>x[0].toLowerCase()===String(name).trim().toLowerCase());return s?s[1]:null;};

const PALETTE=["#5f7f3e","#8a5cc4","#c2452d","#6b7f2a","#b5487f","#d0632a"];
function colorFor(body){
  const b=String(body).trim().toLowerCase();
  if(b==="sun")return "#d9940a";
  if(b==="moon")return "#3c8fc0";
  let h=0;for(const ch of b)h=(h*31+ch.charCodeAt(0))>>>0;
  return PALETTE[h%PALETTE.length];
}

/* ---------- storage ---------- */
function load(){try{const raw=localStorage.getItem(STORE);if(!raw)return null;const s=JSON.parse(raw);if(!s||!s.loc||!Array.isArray(s.obs))return null;return s;}catch(e){return null;}}
function save(){try{localStorage.setItem(STORE,JSON.stringify(state));}catch(e){}}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------- angles and time ---------- */
function parseAngle(str){
  const s=String(str==null?"":str).trim();
  if(!s)return NaN;
  const nums=s.match(/\d+(?:\.\d+)?/g);
  if(!nums)return NaN;
  let v=+nums[0];
  if(nums.length>1)v+=+nums[1]/60;
  if(nums.length>2)v+=+nums[2]/3600;
  return /^\s*-/.test(s)?-v:v;
}
function fmtDM(v){
  if(!num(v))return "";
  const a=Math.abs(v);let d=Math.floor(a);let m=Math.round((a-d)*600)/10;
  if(m>=60){d+=1;m=0;}
  return (v<0?"−":"")+d+"°"+(m<10?"0":"")+m.toFixed(1)+"′";
}
const fmtAz=v=>num(v)?v.toFixed(1).padStart(5,"0")+"°":"";
const sgn=v=>(v>=0?"+":"−")+Math.abs(v);
function fmtTime(ms,tz){
  try{return new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(new Date(ms));}
  catch(e){return new Date(ms).toISOString().slice(11,19);}
}
function validTz(tz){try{new Intl.DateTimeFormat("en-US",{timeZone:tz});return true;}catch(e){return false;}}
function todayISO(){try{return new Date().toLocaleDateString("en-CA",{timeZone:state.loc.tz});}catch(e){return new Date().toISOString().slice(0,10);}}
function shortDate(iso){
  if(!iso)return "";const p=iso.split("-");if(p.length<3)return iso;
  return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+p[1]-1]+" "+(+p[2]);
}
function addDays(iso,n){const [y,m,d]=iso.split("-").map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);}
function dayDiff(a,b){const pa=a.split("-").map(Number),pb=b.split("-").map(Number);return (Date.UTC(pb[0],pb[1]-1,pb[2])-Date.UTC(pa[0],pa[1]-1,pa[2]))/864e5;}

/* ---------- Sun (NOAA) ---------- */
function sunAt(ms){
  const jd=ms/864e5+2440587.5, T=(jd-2451545)/36525;
  const L0=((280.46646+T*(36000.76983+T*0.0003032))%360+360)%360;
  const M=357.52911+T*(35999.05029-0.0001537*T);
  const e=0.016708634-T*(0.000042037+0.0000001267*T);
  const C=sind(M)*(1.914602-T*(0.004817+0.000014*T))+sind(2*M)*(0.019993-0.000101*T)+sind(3*M)*0.000289;
  const om=125.04-1934.136*T;
  const lam=L0+C-0.00569-0.00478*sind(om);
  const eps0=23+(26+(21.448-T*(46.815+T*(0.00059-T*0.001813)))/60)/60;
  const eps=eps0+0.00256*cosd(om);
  const dec=asind(sind(eps)*sind(lam));
  const y=Math.pow(Math.tan(eps*D/2),2);
  const eot=4*(y*sind(2*L0)-2*e*sind(M)+4*e*y*sind(M)*cosd(2*L0)-0.5*y*y*sind(4*L0)-1.25*e*e*sind(2*M))/D;
  return {dec,eot};
}
function cosH(h0,lat,dec){return (sind(h0)-sind(lat)*sind(dec))/(cosd(lat)*cosd(dec));}
function azRise(h0,lat,dec){return acosd((sind(dec)-sind(h0)*sind(lat))/(cosd(h0)*cosd(lat)));}
const sunCache=new Map();
function sunDay(iso,lat,lon){
  const key=iso+"|"+lat.toFixed(4)+"|"+lon.toFixed(4);
  if(sunCache.has(key))return sunCache.get(key);
  const [Y,M,Dd]=iso.split("-").map(Number);const base=Date.UTC(Y,M-1,Dd);
  let t=base+(720-4*lon)*6e4;
  for(let i=0;i<2;i++){t=base+(720-4*lon-sunAt(t).eot)*6e4;}
  const dec=sunAt(t).dec, h0=-0.8333;
  const out={dec,maxAlt:90-Math.abs(lat-dec),culm:lat>=dec?"S":"N",lanMs:t,riseAz:null,setAz:null,riseMs:null,setMs:null};
  const c0=cosH(h0,lat,dec);
  if(c0>-1&&c0<1){
    let H=acosd(c0);
    const dR=sunAt(t-H*4*6e4).dec, HR=acosd(cosH(h0,lat,dR));
    out.riseMs=t-HR*4*6e4;out.riseAz=azRise(h0,lat,dR);
    const dS=sunAt(t+H*4*6e4).dec, HS=acosd(cosH(h0,lat,dS));
    out.setMs=t+HS*4*6e4;out.setAz=360-azRise(h0,lat,dS);
  }
  sunCache.set(key,out);return out;
}
function fromDec(dec,lat,h0){
  const out={dec,maxAlt:90-Math.abs(lat-dec),culm:lat>=dec?"S":"N",riseAz:null,setAz:null};
  const c0=cosH(h0,lat,dec);
  if(c0>-1&&c0<1){out.riseAz=azRise(h0,lat,dec);out.setAz=360-out.riseAz;}
  return out;
}
/* ---------- Moon: Meeus ch. 47 (ELP-2000/82, main terms) ---------- */
const ML=[[0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],[0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],[2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],[2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],[0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],[0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],[4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],[1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],[2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],[0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],[1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],[0,2,0,0,-2069,0]];
const MB=[[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],[2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],[2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794]];
function moonAt(ms){
  const jd=ms/864e5+2440587.5,T=(jd-2451545)/36525;
  const Lp=218.3164477+481267.88123421*T,Dm=297.8501921+445267.1114034*T,M=357.5291092+35999.0502909*T,
        Mp=134.9633964+477198.8675055*T,F=93.2720950+483202.0175233*T;
  const A1=119.75+131.849*T,A2=53.09+479264.290*T,A3=313.45+481266.484*T,E=1-0.002516*T-0.0000074*T*T;
  let sl=0,sr=0,sb=0;
  for(const [d,m,mp,f,l,r] of ML){const a=d*Dm+m*M+mp*Mp+f*F,e=Math.abs(m)===2?E*E:m?E:1;sl+=l*e*sind(a);sr+=r*e*cosd(a);}
  for(const [d,m,mp,f,b] of MB){const a=d*Dm+m*M+mp*Mp+f*F,e=Math.abs(m)===2?E*E:m?E:1;sb+=b*e*sind(a);}
  sl+=3958*sind(A1)+1962*sind(Lp-F)+318*sind(A2);
  sb+=-2235*sind(Lp)+382*sind(A3)+175*sind(A1-F)+175*sind(A1+F)+127*sind(Lp-Mp)-115*sind(Lp+Mp);
  const om=125.04452-1934.136261*T;
  const lam=Lp+sl/1e6-0.00478*sind(om),bet=sb/1e6,dist=385000.56+sr/1000;
  const eps=23.4392911-0.0130042*T+0.00256*cosd(om);
  const dec=asind(sind(bet)*cosd(eps)+cosd(bet)*sind(eps)*sind(lam));
  const ra=(Math.atan2(sind(lam)*cosd(eps)-Math.tan(bet*D)*sind(eps),cosd(lam))/D+360)%360;
  const gmst=((280.46061837+360.98564736629*(jd-2451545)+0.000387933*T*T)%360+360)%360;
  const i=180-Dm-6.289*sind(Mp)+2.100*sind(M)-1.274*sind(2*Dm-Mp)-0.658*sind(2*Dm)-0.214*sind(2*Mp)-0.110*sind(Dm);
  return {dec,ra,gmst,hp:asind(6378.14/dist),illum:(1+cosd(i))/2};
}
function tzOffsetMin(ms,tz){
  try{
    const p=new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(new Date(ms));
    const g=k=>+p.find(x=>x.type===k).value;
    return (Date.UTC(g("year"),g("month")-1,g("day"),g("hour")%24,g("minute"),g("second"))-ms)/6e4;
  }catch(e){return 0;}
}
function localDate(ms,tz){try{return new Date(ms).toLocaleDateString("en-CA",{timeZone:tz});}catch(e){return new Date(ms).toISOString().slice(0,10);}}
const w180=a=>((a%360)+540)%360-180;
const moonCache=new Map();
function moonDay(iso,lat,lon,tz){
  const key=iso+"|"+lat.toFixed(4)+"|"+lon.toFixed(4)+"|"+tz;
  if(moonCache.has(key))return moonCache.get(key);
  const [Y,M,Dd]=iso.split("-").map(Number),base=Date.UTC(Y,M-1,Dd);
  const mid=base-tzOffsetMin(base+12*36e5,tz)*6e4,end=mid+24*36e5,RATE=14.4921/36e5;
  const lha=t=>{const m=moonAt(t);return w180(m.gmst+lon-m.ra);};
  let tt=null,prev=lha(mid-36e5);
  for(let t=mid;t<=end+36e5&&tt==null;t+=36e5){
    const cur=lha(t);
    if(prev<0&&cur>=0&&cur-prev<90){let x=t-cur/RATE;for(let k=0;k<4;k++)x-=lha(x)/RATE;if(x>=mid&&x<end)tt=x;}
    prev=cur;
  }
  if(tt==null){moonCache.set(key,null);return null;}
  const m=moonAt(tt),geo=90-Math.abs(lat-m.dec),alt=geo-asind(sind(m.hp)*cosd(geo));
  const out={dec:m.dec,hp:m.hp,illum:m.illum,maxAlt:alt,culm:lat>=m.dec?"S":"N",lanMs:tt,riseAz:null,setAz:null,riseMs:null,setMs:null};
  for(const sg of [-1,1]){
    let t=tt+sg*6*36e5,ok=true,dec=m.dec,h0=0.125;
    for(let k=0;k<6;k++){
      const mm=moonAt(t);h0=0.7275*mm.hp-0.5667;dec=mm.dec;
      const c=cosH(h0,lat,dec);if(c<=-1||c>=1){ok=false;break;}
      t+=w180(sg*acosd(c)-w180(mm.gmst+lon-mm.ra))/RATE;
    }
    if(!ok)continue;
    const az=azRise(h0,lat,dec);
    if(sg<0){out.riseMs=t;out.riseAz=az;}else{out.setMs=t;out.setAz=360-az;}
  }
  moonCache.set(key,out);return out;
}
function predict(o){
  const {lat,lon}=state.loc;
  if(/^sun$/i.test(o.body.trim())&&o.date)return sunDay(o.date,lat,lon);
  if(/^moon$/i.test(o.body.trim())&&o.date)return moonDay(o.date,lat,lon,state.loc.tz);
  const sd=starDec(o.body);
  if(sd!=null)return fromDec(sd,lat,-0.5667);
  return null;
}
function obsDec(o,lat){
  // Declination implied by each logged number: highest altitude, rise azimuth, set azimuth.
  const fromAz=a=>asind(cosd(a)*cosd(lat));
  const dAlt=num(o.maxAlt)?(o.culm==="N"?lat+(90-o.maxAlt):lat-(90-o.maxAlt)):null;
  const dRise=num(o.riseAz)?fromAz(o.riseAz):null, dSet=num(o.setAz)?fromAz(o.setAz):null;
  const est=[dAlt,dRise,dSet].filter(num);
  if(!est.length)return null;
  // Whole-degree values (typical of spreadsheet data) each carry up to ±0.5° of rounding.
  // Two different days can then share one altitude and draw the same arc, so average the
  // independent estimates. Precise (decimal) observations keep the original priority.
  const whole=[o.maxAlt,o.riseAz,o.setAz].filter(num).every(v=>Math.abs(v-Math.round(v))<1e-9);
  if(whole&&est.length>1)return est.reduce((a,b)=>a+b,0)/est.length;
  return dAlt!=null?dAlt:(dRise!=null?dRise:dSet);
}

/* ---------- cities (GeoNames) ---------- */
const CITIES=window.CITIES; /* the city table lives in cities.js */
const norm=t=>String(t).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const CITY_KEYS=CITIES.c.map(r=>norm(r[0]));
const cityCountry=r=>CITIES.cc[r[2]]||r[2];
const cityLabel=r=>r[0]+(r[1]?", "+r[1]:"")+", "+cityCountry(r);
function searchCities(q){
  const parts=norm(q).split(",").map(x=>x.trim()).filter(Boolean);
  if(!parts.length||parts[0].length<2)return [];
  const name=parts[0],qual=parts.slice(1).join(" ");
  const ok=i=>{if(!qual)return true;const r=CITIES.c[i];return norm(r[1]+" "+r[2]+" "+cityCountry(r)).includes(qual);};
  const starts=[],contains=[];
  for(let i=0;i<CITIES.c.length&&starts.length<8;i++){
    const k=CITY_KEYS[i];
    if(k.startsWith(name)){if(ok(i))starts.push(i);}
    else if(contains.length<8&&k.includes(name)&&ok(i))contains.push(i);
  }
  return starts.concat(contains).slice(0,8);
}

/* ---------- state ---------- */
let state=load();
let firstRun=false;
if(!state){
  firstRun=true;
  state={loc:{...CAMBRIDGE},obs:[],view:{phi:270,tilt:18,style:"arc",labels:true,refs:true,filter:"all"}};
}
state.locMode=state.locMode||"city";
state.view=Object.assign({phi:270,tilt:18,style:"arc",labels:true,refs:true,filter:"all"},state.view||{});
let sel=null, editId=null, lastDeleted=null, clearArmed=false;

function makeSunEntry(iso){
  const s=sunDay(iso,state.loc.lat,state.loc.lon), tz=state.loc.tz;
  return {id:uid(),body:"Sun",date:iso,riseAz:s.riseAz,riseT:s.riseMs!=null?fmtTime(s.riseMs,tz):"",maxAlt:s.maxAlt,culm:s.culm,lanT:fmtTime(s.lanMs,tz),setAz:s.setAz,setT:s.setMs!=null?fmtTime(s.setMs,tz):"",source:"computed",notes:"Meeus 1998, ch. 25",show:true};
}
function makeMoonEntry(iso){
  const r=moonDay(iso,state.loc.lat,state.loc.lon,state.loc.tz);if(!r)return null;
  const tz=state.loc.tz,extra=[];
  const rd=r.riseMs!=null?localDate(r.riseMs,tz):iso, sd=r.setMs!=null?localDate(r.setMs,tz):iso;
  if(rd!==iso)extra.push("rises "+shortDate(rd));
  if(sd!==iso)extra.push("sets "+shortDate(sd));
  return {id:uid(),body:"Moon",date:iso,riseAz:r.riseAz,riseT:r.riseMs!=null?fmtTime(r.riseMs,tz):"",maxAlt:r.maxAlt,culm:r.culm,lanT:fmtTime(r.lanMs,tz),setAz:r.setAz,setT:r.setMs!=null?fmtTime(r.setMs,tz):"",source:"computed",notes:`Meeus 1998, ch. 47; ${Math.round(r.illum*100)}% lit; HP ${(r.hp*60).toFixed(1)}′`+(extra.length?"; "+extra.join(", "):""),show:true};
}
if(firstRun){
  for(let d="2026-09-01";dayDiff(d,"2026-10-20")>=0;d=addDays(d,7))state.obs.push(makeSunEntry(d));
  save();
}

/* ---------- dome ---------- */
let domeGeom=null;
function clampPan(){const g=domeGeom,z=state.view.zoom||1,lim=g.R0*z;state.view.panX=clamp(state.view.panX||0,-lim,lim);state.view.panY=clamp(state.view.panY||0,-lim,lim);}
function updZoomUI(){
  const z=state.view.zoom||1;
  $("zLbl").textContent=z>1?Math.round(z*100)+"%":"";
  $("zOut").disabled=z<=1;$("zFit").disabled=z<=1;
  $("svgWrap").classList.toggle("zoomed",z>1);
}
function zoomAt(vx,vy,f){
  const g=domeGeom;if(!g)return;
  const z0=state.view.zoom||1,z1=clamp(z0*f,1,10),bx=g.W/2,by=46+g.R0;
  const cx=bx+(z0>1?state.view.panX||0:0),cy=by+(z0>1?state.view.panY||0:0);
  if(z1<=1.001){state.view.zoom=1;state.view.panX=0;state.view.panY=0;}
  else{state.view.zoom=z1;state.view.panX=vx-(vx-cx)*z1/z0-bx;state.view.panY=vy-(vy-cy)*z1/z0-by;clampPan();}
  renderDome();updZoomUI();save();
}
function renderDome(){
  const svg=$("dome");
  const W=640,R0=232,screw=!!state.view.screw;
  const {phi,tilt}=state.view;
  const ct=cosd(tilt),st=sind(tilt);
  const H=Math.round(screw?R0*2+110:R0*(1+st)+100);
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  const zf=state.view.zoom||1,R=R0*zf,top=46;
  const cx=W/2+(zf>1?state.view.panX||0:0), cy=top+R0+(zf>1?state.view.panY||0:0);
  domeGeom={W,H,R0};
  const boxes=[];
  function place(x,y,anchor,text,fs){
    const w=String(text).length*fs*0.5;
    const x0=anchor==="start"?x:anchor==="end"?x-w:x-w/2;
    for(let k=0;k<40;k++){
      const b={x:x0,y:y-fs,w,h:fs+1};
      if(!boxes.some(o=>b.x<o.x+o.w&&o.x<b.x+b.w&&b.y<o.y+o.h&&o.y<b.y+b.h)){boxes.push(b);return y;}
      y+=fs+1;
    }
    return y;
  }
  const ce=sind(phi),cn=cosd(phi),rx=-cosd(phi),ry=sind(phi);
  const P=(x,y,z)=>{const d=x*ce+y*cn;return {x:cx+R*(x*rx+y*ry),y:cy-R*(z*ct-d*st),depth:d*ct+z*st,z};};
  const PA=(alt,az)=>P(cosd(alt)*sind(az),cosd(alt)*cosd(az),sind(alt));
  const f=n=>n.toFixed(1);
  const lat=clamp(state.loc.lat,-89.5,89.5);
  function paths(pts){
    let fr="",bk="",prev=null;
    for(let i=1;i<pts.length;i++){
      const p=pts[i-1],q=pts[i];
      if(!p||!q){prev=null;continue;}
      const cls=(p.depth+q.depth)>=-0.0001?"f":"b";
      const seg=cls===prev?` L${f(q.x)} ${f(q.y)}`:`M${f(p.x)} ${f(p.y)} L${f(q.x)} ${f(q.y)}`;
      if(cls==="f")fr+=seg;else bk+=seg;prev=cls;
    }
    return {fr,bk};
  }
  function draw(pts,stroke,w,extra){
    const p=paths(pts);extra=extra||"";
    let s="";
    if(p.bk)s+=`<path d="${p.bk}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-opacity=".38" ${extra}/>`;
    if(p.fr)s+=`<path d="${p.fr}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
    return s;
  }
  function arcPts(dec){
    const pts=[];let pv=null;
    for(let Hh=-180;Hh<=180;Hh+=1){
      const v={x:-cosd(dec)*sind(Hh),y:cosd(lat)*sind(dec)-sind(lat)*cosd(dec)*cosd(Hh),z:sind(lat)*sind(dec)+cosd(lat)*cosd(dec)*cosd(Hh)};
      if(pv&&((pv.z>=0)!==(v.z>=0))){
        const t=pv.z/(pv.z-v.z);let mx=pv.x+(v.x-pv.x)*t,my=pv.y+(v.y-pv.y)*t;const n=Math.hypot(mx,my)||1;
        pts.push(P(mx/n,my/n,0));if(v.z<0)pts.push(null);
      }
      if(v.z>=0)pts.push(P(v.x,v.y,v.z));
      pv=v;
    }
    return pts;
  }
  const vecP=(Hh,dec)=>P(-cosd(dec)*sind(Hh),cosd(lat)*sind(dec)-sind(lat)*cosd(dec)*cosd(Hh),sind(lat)*sind(dec)+cosd(lat)*cosd(dec)*cosd(Hh));
  function outward(p,dist){
    let dx=p.x-cx,dy=p.y-(cy-R*0.25);const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;
    return {x:p.x+dx*dist,y:p.y+dy*dist,anchor:dx>0.25?"start":dx<-0.25?"end":"middle",dy:dy};
  }
  let s="";
  // dome limb
  let limb="";for(let th=0;th<=180;th+=2){limb+=(th?" L":"M")+f(cx+R*cosd(th))+" "+f(cy-R*sind(th));}
  s+=`<path d="${limb}" fill="var(--sky)" fill-opacity=".8" stroke="var(--dome)" stroke-width="1.6"/>`;
  if(screw){
    let lo="";for(let th=180;th<=360;th+=2){lo+=(th>180?" L":"M")+f(cx+R*cosd(th))+" "+f(cy-R*sind(th));}
    s+=`<path d="${lo}" fill="none" stroke="var(--dome)" stroke-width="1" stroke-dasharray="4 5" stroke-opacity=".6"/>`;
    s+=`<text x="${f(cx)}" y="${f(cy+R+22)}" text-anchor="middle" font-size="13" fill="var(--muted)">Below the horizon (dashed)</text>`;
  }
  function drawUD(pts,col,w){
    w=w||1.1;
    const up=pts.map(p=>p&&p.z>=0?p:null),dn=pts.map(p=>p&&p.z<0?p:null);
    return `<g opacity=".6">`+draw(dn,col,Math.max(1,w*0.8),'stroke-dasharray="3 3"')+`</g>`+draw(up,col,w,'');
  }
  // horizon
  const hor=[];for(let a=0;a<=360;a+=3)hor.push(PA(0,a));
  s+=draw(hor,"var(--dome)",1.6);
  // meridian
  const mer=[];for(let a=0;a<=90;a+=2)mer.push(PA(a,0));for(let a=90;a>=0;a-=2)mer.push(PA(a,180));
  s+=draw(mer,"var(--dome)",1.1,'stroke-dasharray="5 4"');
  // N-S and E-W baselines
  s+=draw([PA(0,0),P(0,0,0),PA(0,180)],"var(--muted)",0.8,'stroke-dasharray="2 4"');
  s+=draw([PA(0,90),P(0,0,0),PA(0,270)],"var(--muted)",0.8,'stroke-dasharray="2 4"');
  // azimuth ticks
  for(let a=0;a<360;a+=15){
    const p=PA(0,a),q=PA(a%90===0?4:2.2,a);
    s+=`<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}" stroke="var(--dome)" stroke-width="1.2" stroke-opacity="${p.depth<0?.4:1}"/>`;
    if(a%45===0){
      const card={0:"N",90:"E",180:"S",270:"W"}[a];
      const o=outward(p,card?22:16);
      const lab=card?card:String(a).padStart(3,"0")+"°";
      s+=`<text x="${f(o.x)}" y="${f(o.y+(o.dy>0?10:-2))}" text-anchor="${o.anchor}" font-size="${card?22:14}" font-weight="${card?700:500}" fill="${card?"var(--ink)":"var(--muted)"}" opacity="${p.depth<-0.3&&!card?.6:1}">${lab}</text>`;
    }
  }
  // altitude ticks on meridian
  for(const az of [0,180])for(let a=10;a<90;a+=10){
    const p=PA(a,az);
    s+=`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="2" fill="var(--dome)" fill-opacity="${p.depth<0?.45:1}"/>`;
    if(a%20===0||a===10){
      let dx=p.x-cx;const anchor=Math.abs(dx)<18?"start":dx>0?"start":"end";const off=anchor==="start"?7:-7;
      const yy=place(p.x+off,p.y+4,anchor,a+"°",12.5);
      s+=`<text x="${f(p.x+off)}" y="${f(yy)}" text-anchor="${anchor}" font-size="12.5" fill="var(--muted)">${a}°</text>`;
    }
  }
  // zenith
  const zp=P(0,0,1);
  s+=`<path d="M${f(zp.x-6)} ${f(zp.y)} H${f(zp.x+6)} M${f(zp.x)} ${f(zp.y-6)} V${f(zp.y+6)}" stroke="var(--ink)" stroke-width="1.6"/><text x="${f(zp.x+8)}" y="${f(zp.y-8)}" font-size="13" fill="var(--ink)">Zenith 90°</text>`;
  // reference paths
  if(state.view.refs){
    const refs=[[0,"Equator"],[23.44,"Jun solstice"],[-23.44,"Dec solstice"]];
    for(const [dec,name] of refs){
      s+=draw(arcPts(dec),"var(--ref)",dec===0?1.3:1,dec===0?'stroke-dasharray="7 4"':'stroke-dasharray="1.5 4" stroke-linecap="round"');
      const alt=90-Math.abs(lat-dec);
      if(alt>0){const p=PA(alt,lat>=dec?180:0);const o=outward(p,10);
        const yy=place(o.x,o.y+4,o.anchor,name,12.5);
        s+=`<text x="${f(o.x)}" y="${f(yy)}" text-anchor="${o.anchor}" font-size="12.5" font-weight="600" fill="var(--ref)">${name}</text>`;}
    }
    // pole and axis
    const pole=PA(Math.abs(lat),lat>=0?0:180), c0=P(0,0,0);
    s+=`<line x1="${f(c0.x)}" y1="${f(c0.y)}" x2="${f(pole.x)}" y2="${f(pole.y)}" stroke="var(--ref)" stroke-width="1" stroke-dasharray="3 3"/>`;
    s+=`<circle cx="${f(pole.x)}" cy="${f(pole.y)}" r="4.5" fill="var(--card)" stroke="var(--ref)" stroke-width="1.6"/>`;
    const po=outward(pole,10);
    const pl=(lat>=0?"NCP ":"SCP ")+Math.abs(lat).toFixed(1)+"°";
    const py=place(po.x,po.y+4,po.anchor,pl,12.5);
    s+=`<text x="${f(po.x)}" y="${f(py)}" text-anchor="${po.anchor}" font-size="12.5" font-weight="600" fill="var(--ref)">${pl}</text>`;
  }
  // observer
  const c0=P(0,0,0);
  s+=`<circle cx="${f(c0.x)}" cy="${f(c0.y-7)}" r="3.2" fill="none" stroke="var(--ink)" stroke-width="1.3"/><path d="M${f(c0.x)} ${f(c0.y-3.8)} V${f(c0.y+2)} M${f(c0.x-4)} ${f(c0.y-1)} H${f(c0.x+4)} M${f(c0.x)} ${f(c0.y+2)} L${f(c0.x-3)} ${f(c0.y+7)} M${f(c0.x)} ${f(c0.y+2)} L${f(c0.x+3)} ${f(c0.y+7)}" stroke="var(--ink)" stroke-width="1.3" fill="none"/>`;

  // observations
  const vis=visibleObs();
  if(sel&&!vis.some(o=>o.id===sel))sel=null;
  const hide=state.view.hide||{},many=vis.length>14,lm=state.view.labelMode||"auto";
  const endIds=new Set();{const by=new Map();for(const o of vis){const k=o.body.toLowerCase();if(!by.has(k))by.set(k,[]);by.get(k).push(o);}for(const a of by.values()){endIds.add(a[0].id);endIds.add(a[a.length-1].id);}}
  const screwSet=new Set();
  if(screw){
    const groups=new Map();
    for(const o of vis){
      if(!o.date||starDec(o.body)!=null)continue;
      const d=obsDec(o,lat);if(d==null)continue;
      const k=o.body.toLowerCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push({o,d});
    }
    const vec=(Hh,dec)=>P(-cosd(dec)*sind(Hh),cosd(lat)*sind(dec)-sind(lat)*cosd(dec)*cosd(Hh),sind(lat)*sind(dec)+cosd(lat)*cosd(dec)*cosd(Hh));
    for(const [,arr] of groups){
      const col=sel?"var(--muted)":colorFor(arr[0].o.body),dim=!!sel;
      const total=arr.length>1?dayDiff(arr[0].o.date,arr[arr.length-1].o.date):0;
      const pts=[];
      for(let Hh=-180;Hh<0;Hh+=3)pts.push(vec(Hh,arr[0].d));
      for(let i=0;i<arr.length;i++){
        screwSet.add(arr[i].o.id);
        if(i===arr.length-1){for(let Hh=0;Hh<=180;Hh+=3)pts.push(vec(Hh,arr[i].d));break;}
        const loops=1,n=180;
        for(let j=0;j<n;j++){const fr=j/n;pts.push(vec(fr*loops*360,arr[i].d+(arr[i+1].d-arr[i].d)*fr));}
      }
      s+=`<g opacity="${dim?0.35:1}">`+drawUD(pts,col)+`</g>`;
    }
  }
  let labelsLayer="";
  let selMsg="";
  for(const o of [...vis].sort((a,b)=>(a.id===sel)-(b.id===sel))){
    const isSel=sel===o.id, dim=sel&&!isSel, col=dim?"var(--muted)":colorFor(o.body);
    const w=isSel?3.2:(many?1:1.6), op=dim?0.35:(many?0.75:1);
    let g=`<g data-id="${o.id}" opacity="${op}" style="cursor:pointer">`;
    const culmAz=o.culm==="N"?0:180;
    const pR=num(o.riseAz)?PA(0,o.riseAz):null, pS=num(o.setAz)?PA(0,o.setAz):null, pC=num(o.maxAlt)?PA(o.maxAlt,culmAz):null;
    if(screw&&screwSet.has(o.id)){
      if(isSel){const dec=obsDec(o,lat);if(dec!=null){const fp=[];for(let Hh=-180;Hh<=180;Hh+=2)fp.push(vecP(Hh,dec));g+=drawUD(fp,col,w);}}
    }else if(state.view.style==="arc"){
      const dec=obsDec(o,lat);
      if(dec!=null)g+=draw(arcPts(dec),col,w,'stroke-linejoin="round"');
    }else{
      const pts=[pR,pC,pS].filter(Boolean);
      if(pts.length>1)g+=`<polyline points="${pts.map(p=>f(p.x)+","+f(p.y)).join(" ")}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
    }
    const mark=(p,r)=>p?`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${r}" fill="${o.source==="observed"?col:"var(--card)"}" stroke="${col}" stroke-width="1.8"/>`:"";
    g+=mark(pR,isSel?5:(many?2.6:3.6))+mark(pS,isSel?5:(many?2.6:3.6))+mark(pC,isSel?5.5:(many?3:4));
    if(isSel){
      const every=state.view.times??60, ti=obsLan(o), dec=obsDec(o,lat), tz=state.loc.tz;
      if(every>0&&ti&&dec!=null){
        const step=every*6e4,off=tzOffsetMin(ti.lan,tz)*6e4;
        for(let t=Math.ceil((ti.lan-12*36e5+off)/step)*step-off;t<=ti.lan+12*36e5;t+=step){
          const p=vecP((t-ti.lan)/36e5*ti.rate,dec);
          if(p.z<-0.0001&&!screw)continue;
          const lab=fmtTime(t,tz).slice(0,5),fade=p.z<0?' opacity=".55"':'';
          labelsLayer+=`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="3.4" fill="var(--card)" stroke="${col}" stroke-width="1.8"${fade}/>`;
          const oo=outward(p,8),yy=place(oo.x,oo.y+4,oo.anchor,lab,12);
          labelsLayer+=`<text x="${f(oo.x)}" y="${f(yy)}" text-anchor="${oo.anchor}" font-size="12" font-weight="600" fill="var(--ink)"${fade}>${lab}</text>`;
        }
        for(const [p,tm,arrow] of [[pR,o.riseT,"rise"],[pS,o.setT,"set"]])if(p&&tm){
          const oo=outward(p,48),tx=`${arrow} ${tm.slice(0,5)}`,yy=place(oo.x,oo.y+4,oo.anchor,tx,12.5);
          labelsLayer+=`<text x="${f(oo.x)}" y="${f(yy)}" text-anchor="${oo.anchor}" font-size="12.5" font-weight="700" fill="${col}">${tx}</text>`;
        }
        selMsg=`${o.body}, ${shortDate(o.date)}: clock times every ${every>=60?every/60+" h":every+" min"} along the path (${tz}), counted from its highest point at ${fmtTime(ti.lan,tz).slice(0,5)}.`;
      }else if(every>0){
        selMsg=`${o.body}${o.date?", "+shortDate(o.date):""}: no time for its highest point, so clock times can’t be placed. Add the time of meridian passage to this row to see them.`;
      }else selMsg=`${o.body}${o.date?", "+shortDate(o.date):""} selected. Turn on Times to see clock times along the path.`;
    }
    // wide invisible hit target
    if(state.view.style==="arc"){const dec=obsDec(o,lat);if(dec!=null){const p=paths(arcPts(dec));g+=`<path d="${p.fr+p.bk}" fill="none" stroke="transparent" stroke-width="14"/>`;}}
    g+="</g>";
    s+=g;
    if(state.view.labels&&!dim&&(lm==="all"||isSel||(lm==="auto"&&(!many||endIds.has(o.id))))){
      const fs=isSel?14:12;
      if(pC){const oo=outward(pC,9);const tx=`${shortDate(o.date)||o.body} ${o.maxAlt.toFixed(1)}°`;const yy=place(oo.x,oo.y+4,oo.anchor,tx,fs);
        if(Math.abs(yy-(oo.y+4))>0.5)labelsLayer+=`<line x1="${f(pC.x)}" y1="${f(pC.y)}" x2="${f(oo.x)}" y2="${f(yy-4)}" stroke="${col}" stroke-width=".6" stroke-opacity=".7"/>`;
        labelsLayer+=`<text x="${f(oo.x)}" y="${f(yy)}" text-anchor="${oo.anchor}" font-size="${fs}" fill="${col}" font-weight="600">${esc(tx)}</text>`;}
      for(const [p,v] of [[pR,o.riseAz],[pS,o.setAz]])if(p){
        const oo=outward(p,8);
        labelsLayer+=`<text transform="translate(${f(oo.x)} ${f(oo.y+(oo.dy>0?12:-4))}) rotate(-90)" text-anchor="${oo.dy>0?"end":"start"}" font-size="${fs-1}" fill="${col}" font-weight="600">${Math.round(v)}°</text>`;
      }
    }
  }
  if(clock.on&&clock.date){
    for(const tr of clockTrail)for(const [k,c] of [["s","#d9940a"],["m","#3c8fc0"]]){
      const q=tr[k];if(hide[k==="s"?"sun":"moon"])continue;if(q.alt<0&&!screw)continue;const p=PA(q.alt,q.az);
      s+=`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="2.2" fill="${c}" opacity="${q.alt<0?.3:.75}"/>`;
    }
    const cl=skyAt(clockMs());
    for(const [name,q] of [["Moon",cl.moon],["Sun",cl.sun]]){
      if(hide[name.toLowerCase()])continue;
      if(q.alt<0&&!screw)continue;
      const p=PA(q.alt,q.az),op=q.alt<0?.5:1;
      if(name==="Sun"){
        let rays="";for(let a=0;a<360;a+=45)rays+=`M${f(p.x+cosd(a)*12)} ${f(p.y+sind(a)*12)} L${f(p.x+cosd(a)*17)} ${f(p.y+sind(a)*17)} `;
        s+=`<g opacity="${op}"><path d="${rays}" stroke="#d9940a" stroke-width="2" stroke-linecap="round"/><circle cx="${f(p.x)}" cy="${f(p.y)}" r="9" fill="#f2c14e" stroke="#b5770a" stroke-width="1.6"/></g>`;
      }else{
        s+=`<g opacity="${op}"><circle cx="${f(p.x)}" cy="${f(p.y)}" r="8" fill="#e8ecf2" stroke="#3c8fc0" stroke-width="1.8"/><circle cx="${f(p.x+3)}" cy="${f(p.y-2)}" r="6" fill="#3c8fc0" opacity="${((1-cl.moon.illum)*0.85).toFixed(2)}"/></g>`;
      }
      const oo=outward(p,20),tx=`${name} ${q.alt.toFixed(1)}°`,yy=place(oo.x,oo.y+4,oo.anchor,tx,13);
      labelsLayer+=`<text x="${f(oo.x)}" y="${f(yy)}" text-anchor="${oo.anchor}" font-size="13" font-weight="700" fill="${name==="Sun"?"#b5770a":"#2f78a8"}">${tx}</text>`;
    }
    clockReadout(cl);
  }
  s+=labelsLayer;
  svg.innerHTML=s;
  $("selInfo").textContent=selMsg;
  $("countInfo").textContent=vis.length===state.obs.length?`${vis.length} paths shown`:`${vis.length} of ${state.obs.length} paths shown`;
}

function obsLan(o){
  const b=o.body.trim(),rate=/^moon$/i.test(b)?14.49:/^sun$/i.test(b)?15:15.041;
  if(o.date&&/^\d{1,2}:\d{2}/.test(o.lanT||"")){
    const [Y,M,Dd]=o.date.split("-").map(Number),[h,mi,se]=o.lanT.split(":").map(Number);
    const wall=Date.UTC(Y,M-1,Dd,h,mi,se||0);
    return {lan:wall-tzOffsetMin(wall,state.loc.tz)*6e4,rate};
  }
  const pr=predict(o);
  return pr&&pr.lanMs!=null?{lan:pr.lanMs,rate}:null;
}
function visibleObs(){
  const v=state.view,fl=v.filter,hide=v.hide||{},th=+v.thin||1,from=v.from||"",to=v.to||"";
  let arr=state.obs.filter(o=>{
    if(o.show===false)return false;
    const k=o.body.toLowerCase();
    if(fl!=="all"&&k!==fl)return false;
    if(hide[k])return false;
    if(o.date&&((from&&o.date<from)||(to&&o.date>to)))return false;
    return true;
  }).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  if(th>1){const cnt=new Map();arr=arr.filter(o=>{const k=o.body.toLowerCase(),i=cnt.get(k)||0;cnt.set(k,i+1);return i%th===0||o.id===sel;});}
  return arr;
}

/* ---------- legend, filter ---------- */
function bodies(){const m=new Map();for(const o of state.obs){const k=o.body.toLowerCase();if(!m.has(k))m.set(k,o.body);}return [...m.entries()];}
function renderLegend(){
  const bs=bodies();
  $("legend").innerHTML=bs.length?bs.map(([k,n])=>`<span${(state.view.hide||{})[k]?' style="opacity:.4;text-decoration:line-through"':''}><i class="dot" style="background:${colorFor(n)}"></i>${esc(n)}</span>`).join("")+`<span class="muted"><i class="dot" style="background:var(--muted)"></i>filled marker = observed, open = computed</span>`:"";
  const fsel=$("filter");
  if(state.view.filter!=="all"&&!bs.some(([k])=>k===state.view.filter))state.view.filter="all";
  fsel.innerHTML=`<option value="all">All bodies</option>`+bs.map(([k,n])=>`<option value="${esc(k)}">${esc(n)}</option>`).join("");
  fsel.value=state.view.filter;
}

/* ---------- table ---------- */
function cell(az,time,pAz,observed,isAlt,culm){
  let h="";
  if(num(az))h+=`<span class="v">${isAlt?fmtDM(az)+" "+(culm||""):fmtAz(az)}</span>`;
  else h+=`<span class="muted">—</span>`;
  if(time)h+=`<span class="sub">${esc(time)}</span>`;
  if(observed&&num(az)&&num(pAz)){
    const d=az-pAz;
    h+=isAlt?`<span class="sub">pred ${fmtDM(pAz)}, Δ ${sgn(+(d*60).toFixed(1))}′</span>`:`<span class="sub">pred ${fmtAz(pAz)}, Δ ${sgn(+d.toFixed(1))}°</span>`;
  }
  return h;
}
function renderTable(){
  const tb=$("tbody");
  {const n=state.obs.filter(o=>o.show!==false).length;$("plotCount").textContent=state.obs.length?`${n} of ${state.obs.length} plotted`:"";$("selAll").disabled=!state.obs.length||n===state.obs.length;$("deselAll").disabled=!n;}
  const rows=[...state.obs].sort((a,b)=>(a.date||"").localeCompare(b.date||"")||a.body.localeCompare(b.body));
  if(!rows.length){tb.innerHTML=`<tr><td colspan="8" class="empty">The log is empty. Add an observation, or load Sun or star data to compare against.</td></tr>`;return;}
  tb.innerHTML=rows.map(o=>{
    const pr=predict(o), obs=o.source==="observed";
    return `<tr data-id="${o.id}" class="${sel===o.id?"sel":""}">
      <td><input type="checkbox" data-act="show" ${o.show!==false?"checked":""} aria-label="Plot this row"></td>
      <td><i class="dot" style="background:${colorFor(o.body)}"></i> ${esc(o.body)}${o.notes?`<span class="sub">${esc(o.notes)}</span>`:""}</td>
      <td>${esc(o.date)}</td>
      <td>${cell(o.riseAz,o.riseT,pr&&pr.riseAz,obs)}</td>
      <td>${cell(o.maxAlt,o.lanT,pr&&pr.maxAlt,obs,true,o.culm)}</td>
      <td>${cell(o.setAz,o.setT,pr&&pr.setAz,obs)}</td>
      <td><span class="tag ${obs?"obs":"calc"}">${obs?"Observed":"Computed"}</span></td>
      <td style="white-space:nowrap"><button class="btn ghost small" data-act="edit">Edit</button> <button class="btn ghost small" data-act="del">Delete</button></td>
    </tr>`;}).join("");
  $("tzNote").textContent=`Computed times are zone time for ${state.loc.tz}. Δ is observed minus predicted, shown for observed Sun and catalog-star rows.`;
}
function renderTrends(){
  const groups=new Map();
  for(const o of state.obs){if(!o.date)continue;const k=o.body.toLowerCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);}
  let h="";
  for(const [,arr] of groups){
    if(starDec(arr[0].body)!=null)continue;
    arr.sort((a,b)=>a.date.localeCompare(b.date));
    const a=arr[0],b=arr[arr.length-1],days=dayDiff(a.date,b.date);
    if(arr.length<2||days<=0)continue;
    const parts=[];
    if(num(a.maxAlt)&&num(b.maxAlt))parts.push(`highest altitude went from ${a.maxAlt.toFixed(1)}° to ${b.maxAlt.toFixed(1)}° (${sgn(+((b.maxAlt-a.maxAlt)/days).toFixed(2))}° per day)`);
    if(num(a.riseAz)&&num(b.riseAz))parts.push(`rise azimuth from ${a.riseAz.toFixed(0)}° to ${b.riseAz.toFixed(0)}° (${sgn(+((b.riseAz-a.riseAz)/days).toFixed(2))}° per day)`);
    if(num(a.setAz)&&num(b.setAz))parts.push(`set azimuth from ${a.setAz.toFixed(0)}° to ${b.setAz.toFixed(0)}° (${sgn(+((b.setAz-a.setAz)/days).toFixed(2))}° per day)`);
    if(parts.length)h+=`<p><span style="color:${colorFor(a.body)};font-weight:600">${esc(a.body)}</span>, ${shortDate(a.date)} to ${shortDate(b.date)} (${days} days): ${parts.join("; ")}.</p>`;
    const res=arr.filter(o=>o.source==="observed").map(o=>{const p=predict(o);return p&&num(o.maxAlt)?o.maxAlt-p.maxAlt:null;}).filter(num);
    if(res.length){
      const mean=res.reduce((x,y)=>x+y,0)/res.length, sd=res.length>1?Math.sqrt(res.reduce((x,y)=>x+(y-mean)**2,0)/(res.length-1)):0;
      h+=`<p class="muted">Observed vs predicted altitude for ${esc(a.body)}: mean Δ ${sgn(+(mean*60).toFixed(1))}′${res.length>1?`, spread ±${(sd*60).toFixed(1)}′`:""} over ${res.length} sight${res.length>1?"s":""}. A steady offset points to a systematic error such as index error or height of eye.</p>`;
    }
  }
  $("trends").innerHTML=h?`<h3>Trends</h3>`+h:"";
}

/* ---------- location ---------- */
function fillLoc(){
  const L=state.loc;
  $("locName").value=L.name||"";
  const la=Math.abs(L.lat),lo=Math.abs(L.lon);
  let d=Math.floor(la),m=+((la-d)*60).toFixed(1);if(m>=60){d++;m=0;}
  $("latD").value=d;$("latM").value=m;$("latH").value=L.lat<0?"S":"N";
  d=Math.floor(lo);m=+((lo-d)*60).toFixed(1);if(m>=60){d++;m=0;}
  $("lonD").value=d;$("lonM").value=m;$("lonH").value=L.lon<0?"W":"E";
  $("tz").value=L.tz;
  renderLocLine();
}
function renderLocLine(){
  const L=state.loc;
  $("locLine").innerHTML=`${esc(L.name||"Unnamed place")}<br>${fmtDM(Math.abs(L.lat))} ${L.lat<0?"S":"N"}, ${fmtDM(Math.abs(L.lon))} ${L.lon<0?"W":"E"}`;
}
function readLoc(){
  const latD=+$("latD").value||0,latM=+$("latM").value||0,lonD=+$("lonD").value||0,lonM=+$("lonM").value||0;
  let err="";
  const lat=(latD+latM/60)*($("latH").value==="S"?-1:1), lon=(lonD+lonM/60)*($("lonH").value==="W"?-1:1);
  if(Math.abs(lat)>89.5)err="Latitude must be between 0° and 89°30′.";
  else if(Math.abs(lon)>180)err="Longitude must be between 0° and 180°.";
  const tz=$("tz").value.trim()||"UTC";
  if(!validTz(tz))err=`“${tz}” is not a recognized time zone. Try America/New_York or UTC.`;
  $("locErr").textContent=err;
  if(err)return;
  state.loc={name:$("locName").value.trim(),lat,lon,tz};
  if(!sel||!state.obs.some(o=>o.id===sel))sel=null;
  defaultCulm();save();renderLocLine();showPicked();renderAll();
}
function defaultCulm(){if(!editId)$("fCulm").value=state.loc.lat>=0?"S":"N";}

/* ---------- form ---------- */
function readForm(){
  const body=$("fBody").value.trim(), date=$("fDate").value;
  if(!body)return {err:"Enter a body name, such as Sun or Vega."};
  if(!date)return {err:"Enter the local date of the observation."};
  const out={body,date,culm:$("fCulm").value,riseT:$("fRiseT").value,lanT:$("fLanT").value,setT:$("fSetT").value,source:$("fSrc").value,notes:$("fNotes").value.trim()};
  for(const [k,id,lo,hi,label] of [["riseAz","fRiseAz",0,360,"Rise azimuth"],["setAz","fSetAz",0,360,"Set azimuth"],["maxAlt","fAlt",-90,90,"Altitude"]]){
    const raw=$(id).value.trim();
    if(!raw){out[k]=null;continue;}
    const v=parseAngle(raw);
    if(!num(v)||v<lo||v>hi)return {err:`${label} must be a number from ${lo}° to ${hi}°.`};
    out[k]=v;
  }
  if(out.riseAz==null&&out.setAz==null&&out.maxAlt==null)return {err:"Enter at least one of rise azimuth, altitude, or set azimuth."};
  return {val:out};
}
function resetForm(){
  editId=null;
  for(const id of ["fRiseAz","fSetAz","fAlt","fRiseT","fLanT","fSetT","fNotes"])$(id).value="";
  $("fSrc").value="observed";$("saveBtn").textContent="Add to log";$("formTitle").textContent="Add an observation";$("cancelEdit").hidden=true;
  defaultCulm();
}
function loadIntoForm(o){
  editId=o.id;
  $("fBody").value=o.body;$("fDate").value=o.date||"";
  $("fRiseAz").value=num(o.riseAz)?+o.riseAz.toFixed(2):"";$("fSetAz").value=num(o.setAz)?+o.setAz.toFixed(2):"";
  $("fAlt").value=num(o.maxAlt)?+o.maxAlt.toFixed(3):"";$("fCulm").value=o.culm||"S";
  $("fRiseT").value=o.riseT||"";$("fLanT").value=o.lanT||"";$("fSetT").value=o.setT||"";
  $("fSrc").value=o.source;$("fNotes").value=o.notes||"";
  syncBodySeg();
  $("saveBtn").textContent="Save changes";$("formTitle").textContent="Edit observation";$("cancelEdit").hidden=false;
  $("obsForm").scrollIntoView({behavior:"smooth",block:"start"});
}

/* ---------- CSV ---------- */
const COLS=["body","date","rise_time","rise_az","lan_time","max_alt","culm","set_time","set_az","source","notes"];
function toCsv(){
  const n=v=>num(v)?(+v.toFixed(3)).toString():"";
  return [COLS.join(",")].concat(state.obs.map(o=>[o.body,o.date,o.riseT||"",n(o.riseAz),o.lanT||"",n(o.maxAlt),o.culm||"",o.setT||"",n(o.setAz),o.source,(o.notes||"").replace(/[\r\n]+/g," ")].map(x=>String(x).replace(/,/g,";")).join(","))).join("\n");
}
function fromCsv(text){
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const added=[],bad=[];
  lines.forEach((line,i)=>{
    const c=line.split(",").map(x=>x.trim());
    if(i===0&&/^body$/i.test(c[0]))return;
    const notes=c.slice(10).join(",");
    const ang=v=>{const p=parseAngle(v);return num(p)?p:null;};
    const o={id:uid(),body:c[0]||"",date:c[1]||"",riseT:c[2]||"",riseAz:ang(c[3]),lanT:c[4]||"",maxAlt:ang(c[5]),culm:/^n/i.test(c[6]||"")?"N":(/^s/i.test(c[6]||"")?"S":(state.loc.lat>=0?"S":"N")),setT:c[7]||"",setAz:ang(c[8]),source:/^comp/i.test(c[9]||"")?"computed":"observed",notes,show:true};
    if(!o.body||!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||(o.riseAz==null&&o.maxAlt==null&&o.setAz==null))bad.push(i+1);else added.push(o);
  });
  return {added,bad};
}

/* ---------- toast ---------- */
let toastTimer=null;
function toast(msg,undo){
  $("toastMsg").textContent=msg;$("undoBtn").style.display=undo?"":"none";
  $("toast").style.display="flex";clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$("toast").style.display="none";},5000);
}

/* ---------- wiring ---------- */
function syncViewControls(){
  $("phi").value=Math.round(((state.view.phi%360)+360)%360);$("tilt").value=state.view.tilt;
  $("style").value=state.view.style;$("labels").checked=state.view.labels;$("refs").checked=state.view.refs;
  $("screw").setAttribute("aria-pressed",String(!!state.view.screw));
  {const hd=state.view.hide||{};$("togSun").setAttribute("aria-pressed",String(!hd.sun));$("togMoon").setAttribute("aria-pressed",String(!hd.moon));}
  $("thin").value=String(state.view.thin||1);$("rngFrom").value=state.view.from||"";$("rngTo").value=state.view.to||"";$("labelMode").value=state.view.labelMode||"auto";
  $("times").value=String(state.view.times??60);
  document.querySelectorAll(".seg button[data-phi]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.phi===Math.round(((state.view.phi%360)+360)%360))));
}
function renderAll(){renderLegend();renderDome();renderTable();renderTrends();syncViewControls();}

document.querySelectorAll(".seg button[data-phi]").forEach(b=>b.addEventListener("click",()=>{state.view.phi=+b.dataset.phi;save();renderDome();syncViewControls();}));
$("phi").addEventListener("input",e=>{state.view.phi=+e.target.value;renderDome();syncViewControls();save();});
$("tilt").addEventListener("input",e=>{state.view.tilt=+e.target.value;renderDome();save();});
$("style").addEventListener("change",e=>{state.view.style=e.target.value;save();renderDome();});
$("labels").addEventListener("change",e=>{state.view.labels=e.target.checked;save();renderDome();});
$("refs").addEventListener("change",e=>{state.view.refs=e.target.checked;save();renderDome();});
$("screw").addEventListener("click",()=>{state.view.screw=!state.view.screw;save();renderDome();syncViewControls();});
$("filter").addEventListener("change",e=>{state.view.filter=e.target.value;save();renderDome();});
["Sun","Moon"].forEach(n=>$("tog"+n).addEventListener("click",()=>{const h=state.view.hide=state.view.hide||{},k=n.toLowerCase();h[k]=!h[k];save();renderLegend();renderDome();syncViewControls();}));
$("thin").addEventListener("change",e=>{state.view.thin=+e.target.value||1;save();renderDome();});
$("rngFrom").addEventListener("change",e=>{state.view.from=e.target.value;save();renderDome();});
$("rngTo").addEventListener("change",e=>{state.view.to=e.target.value;save();renderDome();});
$("rngClear").addEventListener("click",()=>{state.view.from="";state.view.to="";save();renderDome();syncViewControls();});
$("labelMode").addEventListener("change",e=>{state.view.labelMode=e.target.value;save();renderDome();});
$("times").addEventListener("change",e=>{state.view.times=+e.target.value;save();renderDome();});

// drag to rotate (or pan when zoomed), pinch / wheel / double-click to zoom
(function(){
  const wrap=$("svgWrap"),svg=$("dome"),pts=new Map();let start=null,moved=false,pinch=null,lastTap=null;
  const toVB=(x,y)=>{const pt=svg.createSVGPoint();pt.x=x;pt.y=y;const q=pt.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,y:q.y};};
  wrap.addEventListener("pointerdown",e=>{
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,z:state.view.zoom||1};moved=true;return;}
    start={x:e.clientX,y:e.clientY,phi:state.view.phi,px:state.view.panX||0,py:state.view.panY||0};moved=false;
  });
  wrap.addEventListener("pointermove",e=>{
    if(!pts.has(e.pointerId))return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pts.size===2){
      const [a,b]=[...pts.values()],d=Math.hypot(a.x-b.x,a.y-b.y),m=toVB((a.x+b.x)/2,(a.y+b.y)/2);
      zoomAt(m.x,m.y,(pinch.z*d/pinch.d)/(state.view.zoom||1));return;
    }
    if(!start)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(!moved&&Math.hypot(dx,dy)>4){moved=true;try{wrap.setPointerCapture(e.pointerId);}catch(_){}}
    if(!moved)return;
    if((state.view.zoom||1)>1){const k=1/svg.getScreenCTM().a;state.view.panX=start.px+dx*k;state.view.panY=start.py+dy*k;clampPan();}
    else state.view.phi=(((start.phi-dx*0.45)%360)+360)%360;
    renderDome();syncViewControls();
  });
  const end=e=>{
    const wasPinch=!!pinch;pts.delete(e.pointerId);if(pts.size<2)pinch=null;
    if(e.type==="pointerup"&&start&&!moved&&!wasPinch){
      const now=Date.now();
      if(lastTap&&now-lastTap.t<400&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24){
        lastTap=null;const p=toVB(e.clientX,e.clientY);zoomAt(p.x,p.y,2);
      }else{
        lastTap={t:now,x:e.clientX,y:e.clientY};
        const g=e.target.closest&&e.target.closest("g[data-id]");
        const nsel=g?(sel===g.dataset.id?null:g.dataset.id):null;
        if(nsel!==sel){sel=nsel;renderDome();renderTable();}
      }
    }
    if(moved)save();
    if(!pts.size){start=null;moved=false;}
  };
  wrap.addEventListener("pointerup",end);
  wrap.addEventListener("pointercancel",end);
  wrap.addEventListener("wheel",e=>{
    if(!e.ctrlKey&&(state.view.zoom||1)<=1)return;
    e.preventDefault();const p=toVB(e.clientX,e.clientY);zoomAt(p.x,p.y,Math.exp(-e.deltaY*0.002));
  },{passive:false});
  const mid=()=>({x:domeGeom.W/2,y:domeGeom.H/2});
  $("zIn").addEventListener("click",()=>{const m=mid();zoomAt(m.x,m.y,1.5);});
  $("zOut").addEventListener("click",()=>{const m=mid();zoomAt(m.x,m.y,1/1.5);});
  $("zFit").addEventListener("click",()=>{state.view.zoom=1;state.view.panX=0;state.view.panY=0;renderDome();updZoomUI();save();});
})();

for(const id of ["locName","latD","latM","latH","lonD","lonM","lonH"])$(id).addEventListener("change",readLoc);
$("tz").addEventListener("change",readLoc);
function setLocMode(m){
  state.locMode=m;
  $("cityPane").hidden=m!=="city";$("coordPane").hidden=m!=="coords";
  document.querySelectorAll(".seg button[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===m)));
  save();
}
document.querySelectorAll(".seg button[data-mode]").forEach(b=>b.addEventListener("click",()=>setLocMode(b.dataset.mode)));
function showPicked(){
  const L=state.loc;
  $("cityPicked").textContent=`Dome set for ${L.name||"your location"}: ${fmtDM(Math.abs(L.lat))} ${L.lat<0?"S":"N"}, ${fmtDM(Math.abs(L.lon))} ${L.lon<0?"W":"E"}, time zone ${L.tz}.`;
}
function renderCityResults(){
  const q=$("citySearch").value,ul=$("cityResults"),hits=searchCities(q);
  if(norm(q).trim().length<2){ul.hidden=true;$("citySearch").setAttribute("aria-expanded","false");return;}
  ul.innerHTML=hits.length?hits.map(i=>{const r=CITIES.c[i];return `<li role="option"><button type="button" data-i="${i}">${esc(r[0])}${r[1]?", "+esc(r[1]):""}<small>${esc(cityCountry(r))} · ${fmtDM(Math.abs(r[3]))} ${r[3]<0?"S":"N"}, ${fmtDM(Math.abs(r[4]))} ${r[4]<0?"W":"E"} · ${esc(CITIES.tz[r[5]])}</small></button></li>`;}).join(""):`<li class="note" style="padding:8px 10px;margin:0">No city matches “${esc(q)}”. Try the nearest larger city, or switch to Enter coordinates.</li>`;
  ul.hidden=false;$("citySearch").setAttribute("aria-expanded","true");
}
function pickCity(i){
  const r=CITIES.c[i];
  state.loc={name:cityLabel(r),lat:r[3],lon:r[4],tz:CITIES.tz[r[5]]};
  $("citySearch").value=cityLabel(r);$("cityResults").hidden=true;$("citySearch").setAttribute("aria-expanded","false");
  $("locErr").textContent="";fillLoc();defaultCulm();save();showPicked();renderAll();
}
$("citySearch").addEventListener("input",renderCityResults);
$("citySearch").addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();const b=$("cityResults").querySelector("button[data-i]");if(b)pickCity(+b.dataset.i);}
  else if(e.key==="ArrowDown"){const b=$("cityResults").querySelector("button");if(b){e.preventDefault();b.focus();}}
  else if(e.key==="Escape"){$("cityResults").hidden=true;}
});
$("cityResults").addEventListener("click",e=>{const b=e.target.closest("button[data-i]");if(b)pickCity(+b.dataset.i);});
$("cityResults").addEventListener("keydown",e=>{
  const b=e.target.closest("li");if(!b)return;
  if(e.key==="ArrowDown"){e.preventDefault();const n=b.nextElementSibling&&b.nextElementSibling.querySelector("button");if(n)n.focus();}
  if(e.key==="ArrowUp"){e.preventDefault();const n=b.previousElementSibling&&b.previousElementSibling.querySelector("button");(n||$("citySearch")).focus();}
});
$("presetCam").addEventListener("click",()=>{state.loc={...CAMBRIDGE};fillLoc();showPicked();$("citySearch").value=CAMBRIDGE.name;$("locErr").textContent="";defaultCulm();save();renderAll();});

$("obsForm").addEventListener("submit",e=>{
  e.preventDefault();
  const r=readForm();$("formErr").textContent=r.err||"";
  if(r.err)return;
  if(editId){const i=state.obs.findIndex(o=>o.id===editId);if(i>=0)state.obs[i]={...state.obs[i],...r.val};sel=editId;toast("Changes saved.");}
  else{const o={id:uid(),show:true,...r.val};state.obs.push(o);sel=o.id;toast(`${o.body}, ${shortDate(o.date)} added to the log.`);}
  resetForm();save();renderAll();
});
$("cancelEdit").addEventListener("click",resetForm);
function syncBodySeg(){
  const v=$("fBody").value.trim().toLowerCase();
  document.querySelectorAll(".seg button[data-body]").forEach(b=>{const k=b.dataset.body.toLowerCase();b.setAttribute("aria-pressed",String(k?k===v:(v!=="sun"&&v!=="moon")));});
}
document.querySelectorAll(".seg button[data-body]").forEach(b=>b.addEventListener("click",()=>{
  const inp=$("fBody");
  if(b.dataset.body)inp.value=b.dataset.body;
  else{if(/^(sun|moon)$/i.test(inp.value.trim()))inp.value="";inp.placeholder="Venus, Vega, ...";inp.focus();}
  syncBodySeg();
}));
$("fBody").addEventListener("input",syncBodySeg);

$("tbody").addEventListener("click",e=>{
  const tr=e.target.closest("tr[data-id]");if(!tr)return;
  const id=tr.dataset.id, o=state.obs.find(x=>x.id===id);if(!o)return;
  const act=e.target.dataset.act;
  if(act==="show"){o.show=e.target.checked;save();renderDome();return;}
  if(act==="edit"){loadIntoForm(o);return;}
  if(act==="del"){
    const i=state.obs.indexOf(o);lastDeleted={o,i};state.obs.splice(i,1);if(sel===id)sel=null;if(editId===id)resetForm();
    save();renderAll();toast(`Deleted ${o.body}, ${shortDate(o.date)}.`,true);return;
  }
  sel=sel===id?null:id;renderDome();renderTable();
});
function setAllPlot(v){for(const o of state.obs)o.show=v;save();renderTable();renderDome();}
$("selAll").addEventListener("click",()=>setAllPlot(true));
$("deselAll").addEventListener("click",()=>setAllPlot(false));
$("undoBtn").addEventListener("click",()=>{
  if(lastDeleted){
    if(Array.isArray(lastDeleted))state.obs=lastDeleted;else state.obs.splice(lastDeleted.i,0,lastDeleted.o);
    lastDeleted=null;save();renderAll();
  }
  $("toast").style.display="none";
});

$("clearAll").addEventListener("click",e=>{
  if(!clearArmed){clearArmed=true;e.target.textContent="Tap again to clear";setTimeout(()=>{clearArmed=false;e.target.textContent="Clear log";},3500);return;}
  clearArmed=false;e.target.textContent="Clear log";
  lastDeleted=state.obs.slice();state.obs=[];sel=null;save();renderAll();toast("Log cleared.",true);
});
$("copyCsv").addEventListener("click",async()=>{
  const csv=toCsv();const out=$("csvOut");
  try{await navigator.clipboard.writeText(csv);toast("Log copied as CSV.");out.hidden=true;}
  catch(err){out.hidden=false;out.value=csv;out.focus();out.select();toast("Copying is blocked here. The CSV is selected below; copy it from there.");}
});

// tabs
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tabs button").forEach(x=>x.setAttribute("aria-selected",String(x===b)));
  document.querySelectorAll(".panel").forEach(p=>p.hidden=p.dataset.panel!==b.dataset.tab);
}));

$("genSun").addEventListener("click",()=>{
  const a=$("sFrom").value,b=$("sTo").value,step=clamp(Math.round(+$("sStep").value||7),1,60),which=$("sBody").value;
  if(!a||!b||dayDiff(a,b)<0){toast("Choose a From date on or before the To date.");return;}
  if(dayDiff(a,b)/step>200){toast("That range makes more than 200 rows per body. Use a larger step.");return;}
  let ns=0,nm=0,skip=0;
  for(let d=a;dayDiff(d,b)>=0;d=addDays(d,step)){
    if(which!=="moon"){state.obs.push(makeSunEntry(d));ns++;}
    if(which!=="sun"){const m=makeMoonEntry(d);if(m){state.obs.push(m);nm++;}else skip++;}
  }
  save();renderAll();
  const parts=[];if(ns)parts.push(`${ns} Sun`);if(nm)parts.push(`${nm} Moon`);
  toast((parts.length?`Added ${parts.join(" and ")} row${ns+nm>1?"s":""}.`:"No rows added.")+(skip?` The Moon does not cross your meridian on ${skip} of those dates, so ${skip>1?"they were":"it was"} skipped.`:""));
});
$("starSel").innerHTML=STARS.map(([n,d])=>`<option value="${n}">${n} (Dec ${d>=0?"N":"S"} ${fmtDM(Math.abs(d))})</option>`).join("");
function addFromDec(body,dec,date,note,h0){
  const r=fromDec(dec,state.loc.lat,h0);
  const o={id:uid(),body,date,riseAz:r.riseAz,riseT:"",maxAlt:r.maxAlt,culm:r.culm,lanT:"",setAz:r.setAz,setT:"",source:"computed",notes:note,show:true};
  state.obs.push(o);sel=o.id;save();renderAll();
  let msg=`${body} added.`;
  if(r.riseAz==null)msg+=r.maxAlt>0?" It never sets at this latitude (circumpolar).":" It never rises at this latitude.";
  toast(msg);
}
$("addStar").addEventListener("click",()=>{const n=$("starSel").value;addFromDec(n,starDec(n),$("starDate").value||todayISO(),"Catalog Dec (approx. 2026)",-0.5667);});
$("addDec").addEventListener("click",()=>{
  const body=$("dBody").value.trim(),v=parseAngle($("dDec").value);
  if(!body){toast("Enter a body name.");return;}
  if(!num(v)||Math.abs(v)>90){toast("Declination must be 0° to 90°, N or S.");return;}
  const dec=$("dHem").value==="S"?-Math.abs(v):Math.abs(v);
  addFromDec(body,dec,$("dDate").value||todayISO(),`From Dec ${dec>=0?"N":"S"} ${fmtDM(Math.abs(dec))}`,-0.5667);
});
$("importCsv").addEventListener("click",()=>{
  const {added,bad}=fromCsv($("csvIn").value);
  $("csvErr").textContent=bad.length?`Skipped line${bad.length>1?"s":""} ${bad.join(", ")}: each row needs a body, a YYYY-MM-DD date, and at least one angle.`:"";
  if(added.length){state.obs.push(...added);save();renderAll();toast(`Imported ${added.length} row${added.length>1?"s":""}.`);$("csvIn").value="";}
});
$("csvFile").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  const rd=new FileReader();rd.onload=()=>{$("csvIn").value=String(rd.result||"");};rd.readAsText(file);
});

/* ---------- sky clock ---------- */
const clock={on:false,date:null,min:720,mode:"day",speed:1,playing:false};
let clockTrail=[],clockRaf=null,clockLast=0,clockLastRender=0,clockLastPush=-1e9,clockDayAcc=0;
function altAzOf(H,dec,lat){
  const x=-cosd(dec)*sind(H),y=cosd(lat)*sind(dec)-sind(lat)*cosd(dec)*cosd(H),z=sind(lat)*sind(dec)+cosd(lat)*cosd(dec)*cosd(H);
  return {alt:asind(z),az:(Math.atan2(x,y)/D+360)%360};
}
function clockMs(){const [Y,M,Dd]=clock.date.split("-").map(Number);const wall=Date.UTC(Y,M-1,Dd)+clock.min*6e4;return wall-tzOffsetMin(wall,state.loc.tz)*6e4;}
function sunGHA(ms){const sa=sunAt(ms),ut=(((ms%864e5)+864e5)%864e5)/6e4;return {gha:((ut/4+sa.eot/4-180)%360+360)%360,dec:sa.dec};}
function skyAt(ms){
  const {lat,lon}=state.loc,sg=sunGHA(ms);
  const sun=altAzOf(w180(sg.gha+lon),sg.dec,lat);
  const m=moonAt(ms),moon=altAzOf(w180(m.gmst+lon-m.ra),m.dec,lat);
  moon.alt-=asind(sind(m.hp)*cosd(moon.alt));moon.illum=m.illum;
  return {ms,sun,moon};
}
function hhmm(min){min=Math.floor(min)%1440;return String(Math.floor(min/60)).padStart(2,"0")+":"+String(min%60).padStart(2,"0");}
function tzAbbr(ms,tz){try{const p=new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"short"}).formatToParts(new Date(ms)).find(x=>x.type==="timeZoneName");return p?p.value:"";}catch(e){return "";}}
function clockReadout(cl){
  const f=(n,q)=>q.alt>=0?`${n} ${q.alt.toFixed(1)}° high at azimuth ${fmtAz(q.az)}`:`${n} below the horizon (${q.alt.toFixed(1).replace("-","−")}°)`;
  $("clockRead").textContent=`${shortDate(clock.date)}, ${clock.date.slice(0,4)}, ${hhmm(clock.min)} ${tzAbbr(cl.ms,state.loc.tz)}: ${f("Sun",cl.sun)}. ${f("Moon",cl.moon)}, ${Math.round(cl.moon.illum*100)}% lit.`;
}
function syncClockUI(){
  $("clockToggle").setAttribute("aria-pressed",String(clock.on));$("clockPanel").hidden=!clock.on;
  $("clockTime").value=Math.floor(clock.min)%1440;$("clockTimeLbl").textContent=hhmm(clock.min);
  if(clock.date)$("clockDate").value=clock.date;$("clockPlay").textContent=clock.playing?"Pause":"Play";
}
function resetTrail(){clockTrail=[];clockLastPush=-1e9;clockDayAcc=0;}
function pushTrail(){const cl=skyAt(clockMs());clockTrail.push({s:cl.sun,m:cl.moon});if(clockTrail.length>800)clockTrail.shift();}
function clockTick(ts){
  if(!clock.playing){clockRaf=null;return;}
  const dt=clockLast?Math.min(0.1,(ts-clockLast)/1000):0;clockLast=ts;
  if(clock.mode==="day"){
    clock.min+=60*clock.speed*dt;
    while(clock.min>=1440){clock.min-=1440;clock.date=addDays(clock.date,1);}
    const abs=dayDiff("2000-01-01",clock.date)*1440+clock.min;
    if(abs-clockLastPush>=5){pushTrail();clockLastPush=abs;}
  }else{
    clockDayAcc+=3*clock.speed*dt;
    while(clockDayAcc>=1){clockDayAcc-=1;clock.date=addDays(clock.date,1);pushTrail();}
  }
  if(ts-clockLastRender>40){clockLastRender=ts;renderDome();syncClockUI();}
  clockRaf=requestAnimationFrame(clockTick);
}
function setPlaying(p){clock.playing=p;clockLast=0;if(p&&!clockRaf)clockRaf=requestAnimationFrame(clockTick);syncClockUI();}
$("clockToggle").addEventListener("click",()=>{clock.on=!clock.on;if(!clock.on)setPlaying(false);resetTrail();syncClockUI();renderDome();});
$("clockPlay").addEventListener("click",()=>setPlaying(!clock.playing));
$("clockDate").addEventListener("change",e=>{if(e.target.value){clock.date=e.target.value;resetTrail();renderDome();syncClockUI();}});
$("clockTime").addEventListener("input",e=>{clock.min=+e.target.value;resetTrail();renderDome();syncClockUI();});
$("clockMode").addEventListener("change",e=>{clock.mode=e.target.value;resetTrail();});
$("clockSpeed").addEventListener("change",e=>{clock.speed=+e.target.value;});

/* ---------- save dome image ---------- */
let dlP=null;
function downloadsNS(){
  if(!dlP)dlP=(window.claude&&typeof window.claude.use==="function")?window.claude.use("downloads").catch(()=>null):Promise.resolve(undefined);
  return dlP;
}
async function offerFile(name,blob,what){
  const ns=await downloadsNS();
  if(ns===undefined){
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);toast((what||"Dome image")+" saved.");return;
  }
  if(!ns){toast("Saving files isn’t available in this view. The downloaded HTML version can save images.");return;}
  try{await ns.save({filename:name,data:blob});toast((what||"Dome image")+" saved.");}
  catch(e){if(e&&e.code==="declined")return;toast(e&&e.code==="rate_limited"?"A save is already waiting for your answer.":"The image couldn’t be saved here.");}
}
async function exportDome(){
  const svg=$("dome"),vb=svg.viewBox.baseVal,cs=getComputedStyle(document.documentElement),cv=v=>cs.getPropertyValue(v).trim();
  const card=cv("--card")||"#fff",ink=cv("--ink")||"#000",muted=cv("--muted")||"#555";
  const inner=svg.innerHTML.replace(/var\((--[\w-]+)\)/g,(m,v)=>cv(v)||"#888");
  const S=2.5,W=vb.width,H=vb.height,head=66;
  const svgStr=`<svg xmlns="http://www.w3.org/2000/svg" width="${W*S}" height="${H*S}" viewBox="0 0 ${W} ${H}"><style>text{font-family:Georgia,'Times New Roman',serif;paint-order:stroke;stroke:${card};stroke-width:3px;stroke-linejoin:round}</style>${inner}</svg>`;
  const img=new Image();img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgStr);
  try{await img.decode();}catch(e){toast("The image couldn’t be made in this browser.");return;}
  const c=document.createElement("canvas");c.width=Math.round(W*S);c.height=Math.round((H+head)*S);
  const g=c.getContext("2d");g.fillStyle=card;g.fillRect(0,0,c.width,c.height);g.scale(S,S);
  g.fillStyle=ink;g.font=`32px ${getComputedStyle(document.querySelector("h1")).fontFamily}`;g.fillText("Caelus",16,38);
  const L=state.loc;g.font=`13px ${getComputedStyle(document.body).fontFamily}`;g.fillStyle=muted;
  g.fillText(`${L.name||"Location"} · ${fmtDM(Math.abs(L.lat))} ${L.lat<0?"S":"N"}, ${fmtDM(Math.abs(L.lon))} ${L.lon<0?"W":"E"}`,16,58);
  g.textAlign="right";let x=W-16;
  for(const [,n] of bodies().reverse()){
    g.fillStyle=ink;g.fillText(n,x,58);const w=g.measureText(n).width;
    g.fillStyle=colorFor(n);g.beginPath();g.arc(x-w-8,54,4.5,0,7);g.fill();x-=w+26;
  }
  g.drawImage(img,0,head,W,H);
  try{c.toBlob(b=>{if(b)offerFile(`caelus-dome-${todayISO()}.png`,b);else toast("The image couldn’t be made in this browser.");},"image/png");}
  catch(e){toast("The image couldn’t be made in this browser.");}
}
$("saveImg").addEventListener("click",exportDome);
downloadsNS();

/* ---------- LAN from equal altitudes ---------- */
let eaRow=null;
const hms=s=>{s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return `${h} h ${m} min ${x} s`;};
$("eCalc").addEventListener("click",()=>{
  const out=$("eOut");eaRow=null;$("eAdd").disabled=true;
  const date=$("eDate").value,am=$("eAM").value,pm=$("ePM").value,tz=state.loc.tz;
  if(!date||!am||!pm){out.innerHTML=`<p class="err">Enter the date and both times.</p>`;return;}
  const we=parseFloat($("eWE").value)||0;
  const toMs=t=>{const [h,mi,se]=t.split(":").map(Number),[Y,M,Dd]=date.split("-").map(Number);const wall=Date.UTC(Y,M-1,Dd,h,mi,se||0)+we*1000;return wall-tzOffsetMin(wall,tz)*6e4;};
  const a=toMs(am),b=toMs(pm);
  if(b<=a){out.innerHTML=`<p class="err">The afternoon time must be later than the morning time.</p>`;return;}
  const altRaw=$("eAlt").value.trim(),alt=altRaw?parseAngle(altRaw):NaN;
  const hoRaw=$("eHo").value.trim(),ho=hoRaw?parseAngle(hoRaw):NaN;
  if(hoRaw&&(!num(ho)||ho<=0||ho>90)){out.innerHTML=`<p class="err">Highest altitude must be between 0° and 90°.</p>`;return;}
  const mid=(a+b)/2,sg=sunGHA(mid),gha=sg.gha,dec=sg.dec;
  const west=gha<180,lonVal=west?gha:360-gha,lonSigned=west?-lonVal:lonVal;
  const culm=state.loc.lat>=dec?"S":"N";
  let latRow="",latVal=null;
  if(num(ho)){const zd=90-ho;latVal=culm==="S"?dec+zd:dec-zd;latRow=`<tr><td>Latitude (zenith distance ${fmtDM(zd)} combined with Dec)</td><td class="v">${fmtDM(Math.abs(latVal))} ${latVal<0?"S":"N"}</td></tr>`;}
  const pr=sunDay(date,state.loc.lat,state.loc.lon),ds=Math.round((mid-pr.lanMs)/1000),dLon=(lonSigned-state.loc.lon)*60;
  const gi=new Date(mid).toISOString();
  out.innerHTML=`<table class="lantab"><tbody>
    <tr><td>Interval between sights</td><td>${hms((b-a)/1000)}</td></tr>
    <tr><td>LAN, zone time (midpoint)</td><td class="v">${fmtTime(mid,tz)} ${tzAbbr(mid,tz)}</td></tr>
    <tr><td>LAN, GMT</td><td>${gi.slice(11,19)} on ${gi.slice(0,10)}</td></tr>
    <tr><td>GHA of the Sun at LAN</td><td>${fmtDM(gha)}</td></tr>
    <tr><td>Longitude (${west?"GHA under 180°, so west":"360° minus GHA, east"})</td><td class="v">${fmtDM(lonVal)} ${west?"W":"E"}</td></tr>
    <tr><td>Declination at LAN</td><td>${fmtDM(Math.abs(dec))} ${dec<0?"S":"N"}</td></tr>${latRow}
  </tbody></table>
  <p class="note">Caelus predicts LAN at ${fmtTime(pr.lanMs,tz)} for ${esc(state.loc.name||"your set location")}, so your result is ${ds===0?"exact":Math.abs(ds)+" s "+(ds<0?"early":"late")}. That places you ${Math.abs(dLon).toFixed(1)}′ of longitude ${dLon<0?"west":"east"} of the set location (each second of time is 0.25′).${Math.abs(ds)>1800?" That is more than 30 minutes off, so check the times, the date and the time zone.":""}</p>`;
  eaRow={id:uid(),body:"Sun",date,riseAz:null,riseT:"",maxAlt:num(ho)?ho:null,culm,lanT:fmtTime(mid,tz),setAz:null,setT:"",source:"observed",
    notes:`Equal altitudes${num(alt)?" at "+fmtDM(alt):""}: ${am} and ${pm}; longitude ${fmtDM(lonVal)} ${west?"W":"E"}`+(latVal!=null?`, latitude ${fmtDM(Math.abs(latVal))} ${latVal<0?"S":"N"}`:""),show:true};
  $("eAdd").disabled=false;
});
$("eAdd").addEventListener("click",()=>{
  if(!eaRow)return;state.obs.push(eaRow);sel=eaRow.id;toast(`Sun, ${shortDate(eaRow.date)} added to the log.`);eaRow=null;$("eAdd").disabled=true;save();renderAll();
});

/* ---------- spreadsheet import (Excel, Google Sheets, CSV) ---------- */
const SH_FIELDS=[["body","Body"],["date","Date"],["riseT","Rise time"],["riseAz","Rise azimuth"],["lanT","Highest point time"],["maxAlt","Highest altitude"],["culm","Highest point bearing (N or S)"],["setT","Set time"],["setAz","Set azimuth"],["source","Source (observed or computed)"],["notes","Notes"],["notes2","More notes"]];
const KNOWN_BODIES=["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn"].concat(STARS.map(x=>x[0]));
const MON=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const sh={wb:null,sheet:"",an:null,all:false,defBody:"Sun"};
let xlsxP=null;
function loadXLSX(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(!xlsxP)xlsxP=new Promise((res,rej)=>{const sc=document.createElement("script");sc.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";sc.onload=()=>window.XLSX?res(window.XLSX):rej();sc.onerror=()=>{xlsxP=null;rej();};document.head.appendChild(sc);});
  return xlsxP;
}
function parseDelimited(text){
  const first=text.split(/\r?\n/,1)[0]||"";
  const d=first.includes("\t")?"\t":(first.split(";").length>first.split(",").length?";":",");
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;}
    else if(ch==='"'&&cell==="")q=true;
    else if(ch===d){row.push(cell);cell="";}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);rows.push(row);}
  return rows;
}
const blank=v=>v==null||String(v).trim()==="";
const p2=n=>String(n).padStart(2,"0");
function shDate(v,year){
  if(blank(v))return "";
  if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${p2(v.getMonth()+1)}-${p2(v.getDate())}`;
  if(typeof v==="number")return v>59&&v<120000?new Date(Date.UTC(1899,11,30)+Math.floor(v)*864e5).toISOString().slice(0,10):"";
  const s=String(v).trim(),Y=+(year||todayISO().slice(0,4));let m;
  if((m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)))return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  const mk=(y,mo,da)=>mo>=1&&mo<=12&&da>=1&&da<=31?`${y}-${p2(mo)}-${p2(da)}`:"";
  if((m=s.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?$/))){
    let a=+m[1],b=+m[2],y=m[3]?+m[3]:Y;if(y<100)y+=2000;return a>12?mk(y,b,a):mk(y,a,b);
  }
  m=s.match(/(?:(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.]*)?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:[\s\-\/.]*(\d{1,2})(?:st|nd|rd|th)?\b)?/i);
  if(!m)return "";
  const ym=s.match(/\b(19|20)\d{2}\b/);
  return mk(ym?+ym[0]:Y,MON.indexOf(m[2].toLowerCase())+1,+(m[3]||m[1]||0));
}
function shTime(v){
  if(blank(v))return "";
  if(v instanceof Date&&!isNaN(v))return `${p2(v.getHours())}:${p2(v.getMinutes())}:${p2(v.getSeconds())}`;
  if(typeof v==="number"){const sec=Math.round((v-Math.floor(v))*86400)%86400;return `${p2(Math.floor(sec/3600))}:${p2(Math.floor(sec%3600/60))}:${p2(sec%60)}`;}
  const m=String(v).trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
  if(!m)return "";let h=+m[1];const ap=(m[4]||"").toLowerCase();
  if(ap.startsWith("p")&&h<12)h+=12;if(ap.startsWith("a")&&h===12)h=0;
  return h<24?`${p2(h)}:${m[2]}:${m[3]||"00"}`:"";
}
function shAngle(v,lo,hi){if(blank(v))return null;const a=typeof v==="number"?v:parseAngle(v);return num(a)&&a>=lo&&a<=hi?a:null;}
function looksTime(vals){const ok=vals.filter(v=>!blank(v));if(!ok.length)return false;return ok.filter(v=>(typeof v==="number"&&v>0&&v<1)||/^\s*\d{1,2}:\d{2}/.test(String(v))||v instanceof Date).length>=ok.length/2;}
function guessField(h,vals){
  h=norm(h);if(!/[a-z]/.test(h))return null;
  const t=/time|clock|hour|utc|gmt|\bzt\b|\bat\b/.test(h)||looksTime(vals);
  const az=/az|bearing|zn|direction/.test(h);
  if(/note|comment|remark|phase|visib|weather|condition|sky|cloud/.test(h))return "notes";
  if(/source|type|method/.test(h))return "source";
  if(/body|object|celestial|planet|star\b|target/.test(h))return "body";
  if(/ris/.test(h))return az?"riseAz":t?"riseT":"riseAz";
  if(/set/.test(h)&&!/offset/.test(h))return az?"setAz":t?"setT":"setAz";
  if(/lan\b|noon|transit|culm|meridian|max|high|peak|\bho\b|alt/.test(h)){if(/n\/s|dir|bearing/.test(h))return "culm";return t&&!/alt|height|\bho\b/.test(h)?"lanT":"maxAlt";}
  if(/date|day/.test(h))return "date";
  return null;
}
function colLetter(i){let x="";i++;while(i>0){const r=(i-1)%26;x=String.fromCharCode(65+r)+x;i=Math.floor((i-1)/26);}return x;}
function mapFromHeader(rows,hr){
  const map={};if(hr<0)return map;const head=rows[hr]||[];
  for(let c=0;c<head.length;c++){
    const f=guessField(String(head[c]??""),rows.slice(hr+1,hr+30).map(r=>r[c]));if(!f)continue;
    if(map[f]==null)map[f]=c;else if(f==="notes"&&map.notes2==null)map.notes2=c;
  }
  return map;
}
function analyze(rows,name){
  rows=rows.filter(r=>Array.isArray(r)&&r.some(v=>!blank(v)));
  let hr=-1,best=1;
  for(let i=0;i<Math.min(10,rows.length-1);i++){
    const sc=Object.keys(mapFromHeader(rows,i)).length;
    if(sc>best){best=sc;hr=i;}
  }
  const pre=rows.slice(0,Math.max(hr,0)).map(r=>r.join(" ")).join(" ");
  const ym=(pre+" "+(name||"")).match(/\b(19|20)\d{2}\b/);
  const re=b=>new RegExp("(^|[^a-z])"+b+"([^a-z]|$)","i");
  const defBody=KNOWN_BODIES.find(b=>re(b).test(name||""))||KNOWN_BODIES.find(b=>new RegExp("^\\s*"+b+"\\b","i").test(pre))||"";
  return {rows,headRow:hr,map:mapFromHeader(rows,hr),year:ym?ym[0]:null,defBody,name:name||""};
}
function shConvert(row,an,defBody,defSrc){
  const m=an.map,get=f=>m[f]==null?"":row[m[f]];
  const cu=String(get("culm")).trim(),so=String(get("source")).trim();
  return {body:String(get("body")??"").trim()||defBody||"Sun",date:shDate(get("date"),an.year),
    riseT:shTime(get("riseT")),riseAz:shAngle(get("riseAz"),0,360),lanT:shTime(get("lanT")),maxAlt:shAngle(get("maxAlt"),-90,90),
    culm:/^n/i.test(cu)?"N":/^s/i.test(cu)?"S":(state.loc.lat>=0?"S":"N"),
    setT:shTime(get("setT")),setAz:shAngle(get("setAz"),0,360),
    source:so?(/comp|calc|pred|alm|table/i.test(so)?"computed":"observed"):defSrc,
    notes:[get("notes"),get("notes2")].map(v=>String(v??"").trim()).filter(Boolean).join("; ")};
}
const dataRows=an=>an.rows.slice(an.headRow+1);
function sheetRows(name){return window.XLSX.utils.sheet_to_json(sh.wb.Sheets[name],{header:1,raw:true,defval:""});}
function useAnalysis(an){sh.an=an;sh.defBody=an.defBody||sh.defBody||"Sun";renderMap();}
function renderMap(){
  const box=$("shMap"),an=sh.an;
  if(!an||!an.rows.length){box.innerHTML=`<p class="err">No data was found in that sheet.</p>`;return;}
  const rows=an.rows,ncol=Math.max(...rows.slice(0,50).map(r=>r.length));
  const heads=[...Array(ncol)].map((_,i)=>{const h=an.headRow>=0?String(rows[an.headRow][i]??"").trim():"";return `Column ${colLetter(i)}${h?": "+h:""}`;});
  const sel=f=>`<select data-field="${f}"><option value="">(none)</option>${heads.map((h,j)=>`<option value="${j}" ${an.map[f]===j?"selected":""}>${esc(h)}</option>`).join("")}</select>`;
  const multi=sh.wb&&sh.wb.SheetNames.length>1;
  const sheets=multi?`<div class="grid2" style="margin-top:10px"><label>Sheet <select id="shSheet">${sh.wb.SheetNames.map(n=>`<option ${n===sh.sheet?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
    <label class="inline" style="align-self:end"><input type="checkbox" id="shAll" ${sh.all?"checked":""}> Import every sheet (${sh.wb.SheetNames.length})</label></div>`:"";
  const hdrOpts=`<option value="-1">(no header row)</option>`+rows.slice(0,10).map((r,i)=>`<option value="${i}" ${an.headRow===i?"selected":""}>Row ${i+1}: ${esc(r.filter(v=>!blank(v)).slice(0,3).join(", ").slice(0,48))}</option>`).join("");
  const data=dataRows(an),defSrc=$("shSrc")?$("shSrc").value:"observed";
  const prev=data.slice(0,5).map(r=>shConvert(r,an,sh.defBody,defSrc));
  box.innerHTML=`${sheets}
    <h3>Match your columns</h3>
    <label>Header row <select id="shHead">${hdrOpts}</select></label>
    <div class="mapgrid">${SH_FIELDS.map(([f,l])=>`<label>${l}${sel(f)}</label>`).join("")}
      <label>Body when no column is chosen <input id="shBody" value="${esc(sh.defBody)}" list="bodyList"></label>
      <label>Source when no column is chosen <select id="shSrc"><option value="observed" ${defSrc==="observed"?"selected":""}>Observed</option><option value="computed" ${defSrc==="computed"?"selected":""}>Computed</option></select></label>
    </div>
    <p class="note">Preview of the first rows as Caelus will read them (${data.length} data row${data.length===1?"":"s"} in this sheet${an.year?`; dates without a year are read as ${an.year}`:""}):</p>
    <div class="prevwrap"><table class="prev"><thead><tr><th>Body</th><th>Date</th><th>Rise</th><th>Highest</th><th>Set</th><th>Notes</th></tr></thead><tbody>${prev.map(o=>`<tr><td>${esc(o.body)}</td><td>${o.date||'<span class="muted">missing</span>'}</td><td>${fmtAz(o.riseAz)} ${o.riseT}</td><td>${num(o.maxAlt)?fmtDM(o.maxAlt)+" "+o.culm:""} ${o.lanT}</td><td>${fmtAz(o.setAz)} ${o.setT}</td><td>${esc(o.notes)}</td></tr>`).join("")}</tbody></table></div>
    <div class="row"><button class="btn" type="button" id="shImport">${multi&&sh.all?"Import every sheet":`Import ${data.length} row${data.length===1?"":"s"}`}</button></div>
    <p class="err" id="shErr"></p>`;
}
$("shMap").addEventListener("change",e=>{
  const t=e.target,an=sh.an;
  if(t.dataset.field){an.map[t.dataset.field]=t.value===""?null:+t.value;renderMap();}
  else if(t.id==="shHead"){an.headRow=+t.value;an.map=mapFromHeader(an.rows,an.headRow);renderMap();}
  else if(t.id==="shSheet"){sh.sheet=t.value;useAnalysis(analyze(sheetRows(t.value),t.value));}
  else if(t.id==="shAll"){sh.all=t.checked;renderMap();}
  else if(t.id==="shBody"){sh.defBody=t.value.trim()||"Sun";renderMap();}
  else if(t.id==="shSrc")renderMap();
});
function importAnalysis(an,defBody,defSrc){
  const added=[],bad=[];
  if(an.map.date==null)return {added,bad,noDate:true};
  for(let r=an.headRow+1;r<an.rows.length;r++){
    const o=shConvert(an.rows[r],an,defBody,defSrc);
    if(!o.date||(o.riseAz==null&&o.maxAlt==null&&o.setAz==null)){
      if(an.rows[r].filter(v=>!blank(v)).length>1)bad.push(r+1);
      continue;
    }
    added.push({id:uid(),show:true,...o});
  }
  return {added,bad};
}
$("shMap").addEventListener("click",e=>{
  if(e.target.id!=="shImport")return;
  const defSrc=$("shSrc").value,parts=[],all=[];let anyNoDate=false;
  const list=sh.wb&&sh.all?sh.wb.SheetNames.map(n=>n===sh.sheet?sh.an:analyze(sheetRows(n),n)):[sh.an];
  for(const an of list){
    const body=an===sh.an?sh.defBody:(an.defBody||sh.defBody);
    const r=importAnalysis(an,body,defSrc);
    if(r.noDate){anyNoDate=true;parts.push(`${an.name||"This sheet"}: no date column found, skipped`);continue;}
    all.push(...r.added);
    parts.push(`${list.length>1?(an.name+": "):""}${r.added.length} row${r.added.length===1?"":"s"} added`+(r.bad.length?`, skipped row${r.bad.length>1?"s":""} ${r.bad.slice(0,10).join(", ")}${r.bad.length>10?"…":""} (no readable date or angle)`:""));
  }
  if(all.length){state.obs.push(...all);save();renderAll();}
  const msg=parts.join(". ")+".";
  $("shErr").textContent=(anyNoDate||!all.length)?msg+(anyNoDate?" Choose the date column, or the header row, and try again.":""):"";
  toast(all.length?`Imported ${all.length} row${all.length===1?"":"s"}. ${msg}`:msg);
});
$("shRead").addEventListener("click",()=>{
  const tx=$("shPaste").value;if(!tx.trim()){$("shMap").innerHTML=`<p class="err">Paste some cells first.</p>`;return;}
  sh.wb=null;sh.all=false;useAnalysis(analyze(parseDelimited(tx),""));
});
$("shFile").addEventListener("change",async e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  const box=$("shMap");sh.all=false;
  if(/\.(csv|tsv|txt)$/i.test(file.name)){sh.wb=null;useAnalysis(analyze(parseDelimited(await file.text()),file.name));e.target.value="";return;}
  box.innerHTML=`<p class="note">Reading ${esc(file.name)}…</p>`;
  let X;try{X=await loadXLSX();}catch(err){box.innerHTML=`<p class="err">Reading Excel files needs an internet connection the first time. Save the sheet as CSV, or copy the cells and paste them above.</p>`;return;}
  try{
    sh.wb=X.read(await file.arrayBuffer(),{type:"array"});sh.sheet=sh.wb.SheetNames[0];sh.all=sh.wb.SheetNames.length>1;
    useAnalysis(analyze(sheetRows(sh.sheet),sh.sheet));
  }catch(err){box.innerHTML=`<p class="err">That file couldn’t be read as a spreadsheet.</p>`;}
  e.target.value="";
});

// init
/* ---------- Make prediction tab ---------- */
(function(){
  const pv={mode:"sun",phi:270,tilt:24,date:todayISO(),guess:null,revealed:false,hint:false,key:"",moon:null,tides:[],tideIdx:0};
  state.preds=Array.isArray(state.preds)?state.preds:[];
  const f1=n=>n.toFixed(1);
  const fdeg=v=>(v<0?"\u2212":"")+Math.abs(v).toFixed(1)+"\u00b0";
  const wrapAz=a=>((a%360)+360)%360;
  const compass=az=>["N","NE","E","SE","S","SW","W","NW"][Math.round(wrapAz(az)/45)%8];
  const dateLong=iso=>{try{return new Date(iso+"T12:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"long",day:"numeric",year:"numeric"});}catch(e){return iso;}};
  const place=()=>state.loc.name||(Math.abs(state.loc.lat).toFixed(2)+"\u00b0"+(state.loc.lat>=0?"N":"S")+" "+Math.abs(state.loc.lon).toFixed(2)+"\u00b0"+(state.loc.lon>=0?"E":"W"));
  const angDist=(a1,h1,a2,h2)=>acosd(sind(h1)*sind(h2)+cosd(h1)*cosd(h2)*cosd(a1-a2));
  const locKey=()=>state.loc.lat+"|"+state.loc.lon;
  const isSun=()=>pv.mode==="sun";
  const stamp=(ms)=>{
    const tz=state.loc.tz;
    try{return {time:fmtTime(ms,tz).slice(0,5),day:new Date(ms).toLocaleDateString("en-US",{timeZone:tz,weekday:"long",month:"long",day:"numeric"})};}
    catch(e){return {time:fmtTime(ms,"UTC").slice(0,5)+" UTC",day:new Date(ms).toISOString().slice(0,10)};}
  };
  function geom(){const R0=215,top=40,W=640,st=sind(pv.tilt);return {W,R0,top,H:Math.round(top+R0*(1+st)+64)};}
  function proj(){
    const {W,R0,top}=geom(),phi=pv.phi,ce=sind(phi),cn=cosd(phi),rx=-cosd(phi),ry=sind(phi),ct=cosd(pv.tilt),st=sind(pv.tilt),cx=W/2,cy=top+R0;
    const P=(x,y,z)=>{const d=x*ce+y*cn;return {x:cx+R0*(x*rx+y*ry),y:cy-R0*(z*ct-d*st),depth:d*ct+z*st,z};};
    const PA=(alt,az)=>P(cosd(alt)*sind(az),cosd(alt)*cosd(az),sind(alt));
    // screen point -> sky direction: the near (front) surface of the dome first, then the far surface
    const inv=(sx,sy)=>{
      const a=(sx-cx)/R0,v=(cy-sy)/R0,q=1-a*a-v*v;if(q<0)return null;
      const dep0=Math.sqrt(q);
      for(const dep of [dep0,-dep0]){
        const d=dep*ct-v*st,z=dep*st+v*ct;
        if(z>=-1e-9){const x=a*rx+d*ce,y=a*ry+d*cn;return {az:wrapAz(Math.atan2(x,y)/D),alt:asind(clamp(z,0,1))};}
      }
      return null;
    };
    return {P,PA,inv,cx,cy,R0};
  }
  /* ----- the two kinds of round ----- */
  function sunNoon(){
    const {lat,lon}=state.loc,d=sunDay(pv.date,lat,lon);
    return {d,az:d.culm==="S"?180:0,alt:d.maxAlt,up:d.maxAlt>0.05};
  }
  const MRATE=14.4921/36e5;
  const mlha=t=>{const m=moonAt(t);return w180(m.gmst+state.loc.lon-m.ra);};
  function phaseInfo(ms){
    const m=moonAt(ms),sg=sunGHA(ms),raS=((m.gmst-sg.gha)%360+360)%360,waxing=w180(m.ra-raS)>0,f=m.illum;
    let name;
    if(f<0.03)name="New Moon";else if(f>0.97)name="Full Moon";
    else if(waxing)name=f<0.45?"Waxing crescent":f<0.55?"First quarter":"Waxing gibbous";
    else name=f<0.45?"Waning crescent":f<0.55?"Last quarter":"Waning gibbous";
    return {illum:f,waxing,name};
  }
  // "pretend ocean": high tide happens exactly when the Moon is on the meridian,
  // either on your side of the Earth (upper transit) or the far side (lower transit)
  function findEvents(fn,start,end){
    const out=[];let prev=fn(start-36e5);
    for(let t=start;t<=end+36e5;t+=36e5){
      const cur=fn(t);
      if(prev<0&&cur>=0&&cur-prev<90){let x=t-cur/MRATE;for(let k=0;k<4;k++)x-=fn(x)/MRATE;if(x>=start&&x<end)out.push(x);}
      prev=cur;
    }
    return out;
  }
  function setTides(){
    const [Y,M,Dd]=pv.date.split("-").map(Number),base=Date.UTC(Y,M-1,Dd);
    const start=base-tzOffsetMin(base+12*36e5,state.loc.tz)*6e4,end=start+24*36e5,ev=[];
    for(const x of findEvents(t=>mlha(t),start,end))ev.push({ms:x,kind:"upper"});
    for(const x of findEvents(t=>w180(mlha(t)-180),start,end))ev.push({ms:x,kind:"lower"});
    ev.sort((a,b)=>a.ms-b.ms);
    pv.tides=ev.map(e=>{const sk=skyAt(e.ms).moon,ph=phaseInfo(e.ms);return {ms:e.ms,kind:e.kind,alt:sk.alt,az:sk.az,illum:ph.illum,waxing:ph.waxing,phase:ph.name};});
    pv.tideIdx=0;pv.moon=pv.tides[0]||null;pv.guess=null;pv.revealed=false;pv.key=locKey()+"|"+pv.date+"|moon";
  }
  function selectTide(i){
    if(!pv.tides.length)return;
    pv.tideIdx=((i%pv.tides.length)+pv.tides.length)%pv.tides.length;pv.moon=pv.tides[pv.tideIdx];
    pv.guess=null;pv.revealed=false;update();
  }
  function answer(){
    if(isSun())return Object.assign({mode:"sun"},sunNoon());
    const m=pv.moon;if(!m)return {mode:"moon",up:false,az:0,alt:-90,none:true};
    return {mode:"moon",az:m.az,alt:m.alt,up:m.alt>0,m};
  }
  const playable=()=>isSun()?sunNoon().up:!!pv.moon;
  /* ----- drawing helpers ----- */
  function segs(pts){
    let fr="",bk="",prev=null;
    for(let i=1;i<pts.length;i++){
      const p=pts[i-1],q=pts[i];
      if(!p||!q){prev=null;continue;}
      const cls=(p.depth+q.depth)>=-0.0001?"f":"b";
      const seg=cls===prev?` L${f1(q.x)} ${f1(q.y)}`:`M${f1(p.x)} ${f1(p.y)} L${f1(q.x)} ${f1(q.y)}`;
      if(cls==="f")fr+=seg;else bk+=seg;prev=cls;
    }
    return {fr,bk};
  }
  function line(pts,stroke,w,extra){
    const p=segs(pts);extra=extra||"";let s="";
    if(p.bk)s+=`<path d="${p.bk}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-opacity=".38" ${extra}/>`;
    if(p.fr)s+=`<path d="${p.fr}" fill="none" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
    return s;
  }
  function sunGlyph(p,kind){
    let rays="";for(let a=0;a<360;a+=45)rays+=`M${f1(p.x+cosd(a)*12)} ${f1(p.y+sind(a)*12)} L${f1(p.x+cosd(a)*18)} ${f1(p.y+sind(a)*18)} `;
    if(kind==="guess")return `<g><path d="${rays}" stroke="var(--robe)" stroke-width="2" stroke-linecap="round"/><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="9" fill="var(--card)" fill-opacity=".7" stroke="var(--robe)" stroke-width="2" stroke-dasharray="3 2.5"/></g>`;
    return `<g><path d="${rays}" stroke="#d9940a" stroke-width="2" stroke-linecap="round"/><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="9" fill="#f2c14e" stroke="#b5770a" stroke-width="1.6"/></g>`;
  }
  function moonEl(cx,cy,r,f,waxing,op){
    const rx=Math.abs(2*f-1)*r,sw=f>0.5?1:0;
    const lit=`<path d="M${f1(cx)} ${f1(cy-r)} A${r} ${r} 0 0 1 ${f1(cx)} ${f1(cy+r)} A${f1(rx)} ${r} 0 0 ${sw} ${f1(cx)} ${f1(cy-r)} Z" fill="#f4f1e0"/>`;
    return `<g opacity="${op||1}"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="#4a5578"/>${waxing?lit:`<g transform="translate(${f1(2*cx)} 0) scale(-1 1)">${lit}</g>`}<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="none" stroke="#3c8fc0" stroke-width="1.6"/></g>`;
  }
  const moonSvg=(f,waxing,size)=>`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="vertical-align:middle;display:inline-block" aria-hidden="true">${moonEl(size/2,size/2,size/2-2,f,waxing,1)}</svg>`;
  function render(){
    const g=geom(),pj=proj(),{P,PA,cx,cy,R0}=pj,svg=$("pdome");
    svg.setAttribute("viewBox",`0 0 ${g.W} ${g.H}`);
    const lat=clamp(state.loc.lat,-89.5,89.5),act=answer(),sun=isSun();
    const outward=(p,dist)=>{let dx=p.x-cx,dy=p.y-(cy-R0*0.25);const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;return {x:p.x+dx*dist,y:p.y+dy*dist,anchor:dx>0.25?"start":dx<-0.25?"end":"middle",dy};};
    const halo='paint-order="stroke" stroke="var(--card)" stroke-width="3" stroke-linejoin="round"';
    let s="",top="";
    let limb="";for(let th=0;th<=180;th+=2)limb+=(th?" L":"M")+f1(cx+R0*cosd(th))+" "+f1(cy-R0*sind(th));
    s+=`<path d="${limb}" fill="var(--sky)" fill-opacity=".85" stroke="var(--dome)" stroke-width="1.6"/>`;
    const hor=[];for(let a=0;a<=360;a+=3)hor.push(PA(0,a));
    s+=`<path d="${hor.map((p,i)=>(i?"L":"M")+f1(p.x)+" "+f1(p.y)).join(" ")} Z" fill="var(--soft)" fill-opacity=".9"/>`;
    for(const a of [15,30,45,60,75]){const pts=[];for(let az=0;az<=360;az+=4)pts.push(PA(a,az));s+=line(pts,"var(--muted)",.8,'stroke-dasharray="2 4"');}
    s+=line([PA(0,0),P(0,0,0),PA(0,180)],"var(--muted)",.8,'stroke-dasharray="2 4"');
    s+=line([PA(0,90),P(0,0,0),PA(0,270)],"var(--muted)",.8,'stroke-dasharray="2 4"');
    if(pv.hint){const mer=[];for(let a=0;a<=90;a+=2)mer.push(PA(a,0));for(let a=90;a>=0;a-=2)mer.push(PA(a,180));s+=line(mer,"var(--ref)",1.5,'stroke-dasharray="6 4"');}
    s+=line(hor,"var(--dome)",1.8);
    for(let a=0;a<360;a+=15){
      const p=PA(0,a),q=PA(a%90===0?4:2.2,a);
      s+=`<line x1="${f1(p.x)}" y1="${f1(p.y)}" x2="${f1(q.x)}" y2="${f1(q.y)}" stroke="var(--dome)" stroke-width="1.2" stroke-opacity="${p.depth<0?.4:1}"/>`;
      if(a%45===0){
        const card={0:"N",90:"E",180:"S",270:"W"}[a],o=outward(p,card?22:16);
        s+=`<text x="${f1(o.x)}" y="${f1(o.y+(o.dy>0?10:-2))}" text-anchor="${o.anchor}" font-size="${card?22:14}" font-weight="${card?700:500}" fill="${card?"var(--ink)":"var(--muted)"}" opacity="${p.depth<-0.3&&!card?.6:1}">${card||String(a).padStart(3,"0")+"\u00b0"}</text>`;
      }
    }
    for(const a of [15,30,45,60,75]){const p=PA(a,pv.phi);s+=`<text x="${f1(p.x+6)}" y="${f1(p.y+4)}" font-size="11.5" fill="var(--muted)">${a}\u00b0</text>`;}
    const zp=P(0,0,1);
    s+=`<path d="M${f1(zp.x-5)} ${f1(zp.y)} H${f1(zp.x+5)} M${f1(zp.x)} ${f1(zp.y-5)} V${f1(zp.y+5)}" stroke="var(--ink)" stroke-width="1.3"/>`;
    // the little person at the center
    const c0=P(0,0,0);
    s+=`<g stroke="var(--ink)" stroke-width="1.9" stroke-linecap="round" fill="none"><circle cx="${f1(c0.x)}" cy="${f1(c0.y-13)}" r="5" fill="var(--card)"/><path d="M${f1(c0.x)} ${f1(c0.y-8)} V${f1(c0.y+4)} M${f1(c0.x-7)} ${f1(c0.y-2)} H${f1(c0.x+7)} M${f1(c0.x)} ${f1(c0.y+4)} L${f1(c0.x-5)} ${f1(c0.y+13)} M${f1(c0.x)} ${f1(c0.y+4)} L${f1(c0.x+5)} ${f1(c0.y+13)}"/></g>`;
    s+=`<text x="${f1(c0.x+11)}" y="${f1(c0.y+16)}" font-size="12" fill="var(--muted)" ${halo}>you</text>`;
    // the answer
    if(pv.revealed&&sun&&act.up){
      const dec=act.d.dec,pts=[];let prev=null;
      for(let H=-180;H<=180;H+=1){
        const v={x:-cosd(dec)*sind(H),y:cosd(lat)*sind(dec)-sind(lat)*cosd(dec)*cosd(H),z:sind(lat)*sind(dec)+cosd(lat)*cosd(dec)*cosd(H)};
        if(prev&&((prev.z>=0)!==(v.z>=0))){const t=prev.z/(prev.z-v.z);let mx=prev.x+(v.x-prev.x)*t,my=prev.y+(v.y-prev.y)*t;const n=Math.hypot(mx,my)||1;pts.push(P(mx/n,my/n,0));if(v.z<0)pts.push(null);}
        if(v.z>=0)pts.push(P(v.x,v.y,v.z));
        prev=v;
      }
      s+=line(pts,"#d9940a",1.8,'stroke-dasharray="7 4"');
    }
    if(pv.revealed&&!sun&&pv.moon){
      const m=pv.moon,pts=[];
      for(let t=m.ms-13*36e5;t<=m.ms+13*36e5;t+=18e5){const q=skyAt(t).moon;pts.push(q.alt>=0?PA(q.alt,q.az):null);}
      s+=line(pts,"#3c8fc0",1.8,'stroke-dasharray="7 4"');
    }
    if(pv.revealed&&act.up&&pv.guess&&!pv.guess.below){
      const g1=pv.guess,v1=[cosd(g1.alt)*sind(g1.az),cosd(g1.alt)*cosd(g1.az),sind(g1.alt)],v2=[cosd(act.alt)*sind(act.az),cosd(act.alt)*cosd(act.az),sind(act.alt)];
      const dl=Math.acos(clamp(v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2],-1,1));
      if(dl>0.004){const gp=[];for(let i=0;i<=40;i++){const t=i/40,a=Math.sin((1-t)*dl)/Math.sin(dl),b=Math.sin(t*dl)/Math.sin(dl);gp.push(P(a*v1[0]+b*v2[0],a*v1[1]+b*v2[1],a*v1[2]+b*v2[2]));}s+=line(gp,"var(--robe)",1.6,'stroke-dasharray="4 3"');}
    }
    if(pv.revealed&&act.up){
      const pa=PA(act.alt,act.az);
      s+=sun?sunGlyph(pa,"actual"):moonEl(pa.x,pa.y,10,pv.moon.illum,pv.moon.waxing,1);
      const oa=outward(pa,24);top+=`<text x="${f1(oa.x)}" y="${f1(oa.y+4)}" text-anchor="${oa.anchor}" font-size="13.5" font-weight="700" fill="${sun?"#8a5a06":"#2f78a8"}" ${halo}>${sun?"Sun at noon":"Moon at high tide"}</text>`;
    }
    if(pv.revealed&&!sun&&!act.up&&!act.none){
      // the Moon is on the far side of the Earth: show it below the floor
      const pa=PA(act.alt,act.az);
      s+=moonEl(pa.x,pa.y,10,pv.moon.illum,pv.moon.waxing,.55);
      top+=`<text x="${f1(pa.x)}" y="${f1(pa.y+28)}" text-anchor="middle" font-size="13" font-weight="700" fill="#2f78a8" ${halo}>Moon: far side of the Earth</text>`;
    }
    if(pv.guess&&pv.guess.below){
      top+=`<circle cx="${f1(c0.x)}" cy="${f1(c0.y+44)}" r="10" fill="var(--card)" fill-opacity=".7" stroke="var(--robe)" stroke-width="2" stroke-dasharray="3 2.5"/><text x="${f1(c0.x+16)}" y="${f1(c0.y+48)}" font-size="13" font-weight="700" fill="var(--robe)" ${halo}>Your guess: under my feet</text>`;
    }else if(pv.guess){
      const pg=PA(pv.guess.alt,pv.guess.az);
      s+=sun?sunGlyph(pg,"guess"):`<circle cx="${f1(pg.x)}" cy="${f1(pg.y)}" r="10" fill="var(--card)" fill-opacity=".7" stroke="var(--robe)" stroke-width="2" stroke-dasharray="3 2.5"/>`;
      const og=outward(pg,24);top+=`<text x="${f1(og.x)}" y="${f1(og.y+4)}" text-anchor="${og.anchor}" font-size="13.5" font-weight="700" fill="var(--robe)" ${halo}>Your guess</text>`;
    }
    s+=top;
    s+=`<circle id="pGhost" r="8" fill="none" stroke="var(--robe)" stroke-width="1.4" stroke-dasharray="2 3" visibility="hidden" pointer-events="none"/>`;
    svg.innerHTML=s;
  }
  function tideScene(up){
    const moon=up?moonEl(330,28,11,pv.moon.illum,pv.moon.waxing,1):"";
    const note=up?"":`<text x="190" y="102" text-anchor="middle" font-size="11" fill="var(--ink)">The Moon is on the far side of the Earth</text>`;
    return `<svg viewBox="0 0 380 112" width="100%" style="max-width:420px;display:block;margin:8px 0" role="img" aria-label="A beach at high tide">
      <rect width="380" height="112" rx="6" fill="var(--sky)"/>
      ${moon}
      <polygon points="0,112 0,78 190,88 380,100 380,112" fill="#d8c79a"/>
      <path d="M0,60 Q20,54 40,60 T80,60 T120,60 T160,60 T200,62 L236,86 L0,78 Z" fill="#3c8fc0" fill-opacity=".85"/>
      <path d="M0,60 Q20,54 40,60 T80,60 T120,60 T160,60 T200,62" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
      <line x1="262" y1="50" x2="262" y2="96" stroke="var(--ink)" stroke-width="2"/>
      <line x1="256" y1="64" x2="268" y2="64" stroke="var(--ink)" stroke-width="1.4"/><line x1="256" y1="78" x2="268" y2="78" stroke="var(--ink)" stroke-width="1.4"/>
      <path d="M244,62 L254,64 L244,66 Z" fill="var(--robe)"/>
      <text x="274" y="62" font-size="11" font-weight="700" fill="var(--robe)">HIGH TIDE</text>
      ${note}
    </svg>`;
  }
  function resultHTML(){
    const act=answer(),gs=pv.guess;if(!gs||act.none)return "";
    const tz=state.loc.tz;
    if(isSun()){
      if(!act.up)return "";
      const dist=angDist(gs.az,gs.alt,act.az,act.alt),dAlt=gs.alt-act.alt,dAz=((gs.az-act.az+540)%360)-180;
      const dirW=act.az===180?(dAz>0?"west":"east"):(dAz>0?"east":"west");
      const altTxt=Math.abs(dAlt)<0.5?"about right":`${f1(Math.abs(dAlt))}\u00b0 too ${dAlt>0?"high":"low"}`;
      const azTxt=Math.abs(dAz)<0.5?"on the line":`${f1(Math.abs(dAz))}\u00b0 too far ${dirW}`;
      const rate=dist<2?"Bullseye!":dist<5?"Very close.":dist<10?"Close.":dist<20?"Not bad.":"Far off.";
      const lat=state.loc.lat,dec=act.d.dec,ltime=fmtTime(act.d.lanMs,tz).slice(0,5)+" "+tzAbbr(act.d.lanMs,tz);
      return `<div class="presult"><p class="pbig">${rate} You were ${f1(dist)}\u00b0 from the Sun.</p>
      <table class="lantab"><tbody>
        <tr><td>Your guess</td><td>azimuth ${f1(gs.az)}\u00b0 (${compass(gs.az)}), altitude ${f1(gs.alt)}\u00b0</td></tr>
        <tr><td>The Sun at noon</td><td>azimuth ${f1(act.az)}\u00b0 (due ${act.az===180?"south":"north"}), altitude ${f1(act.alt)}\u00b0</td></tr>
        <tr><td>Off by</td><td>altitude: ${altTxt}; direction: ${azTxt}</td></tr>
      </tbody></table>
      <p class="note">At local noon the Sun crosses your meridian, the line from due north to due south through the point overhead, so it stands due ${act.az===180?"south":"north"} of you. Its height is 90\u00b0 \u2212 |latitude \u2212 declination| = 90\u00b0 \u2212 |${fdeg(lat)} \u2212 (${fdeg(dec)})| = ${f1(act.alt)}\u00b0. The dashed amber arc is the Sun\u2019s whole path that day.</p>
      <p class="note">The Sun is highest at ${ltime}, not at 12:00 on the clock, because of time zones, daylight saving time and the equation of time.</p></div>`;
    }
    // Moon and tides
    const m=pv.moon,st=stamp(m.ms),nx=stamp(m.ms+12.4206*36e5),hidden=!act.up;
    let head,sub="";
    if(gs.below&&hidden){head="Spot on! The Moon was under your feet.";}
    else if(gs.below){head="Not quite. The Moon was up in the sky.";}
    else if(hidden){head="Not quite. The Moon was on the far side of the Earth.";}
    else{
      const dist=angDist(gs.az,gs.alt,act.az,act.alt);
      head=(dist<3?"Bullseye!":dist<8?"Very close.":dist<15?"Close.":dist<30?"Not bad.":"Far off.")+` Your pin was ${f1(dist)}\u00b0 from the Moon.`;
    }
    const yours=gs.below?"The Moon is under my feet":`azimuth ${f1(gs.az)}\u00b0 (${compass(gs.az)}), altitude ${f1(gs.alt)}\u00b0`;
    const truth=hidden?`hidden below the horizon (${f1(Math.abs(act.alt))}\u00b0 below it), on the far side of the Earth`:`azimuth ${f1(act.az)}\u00b0 (${compass(act.az)}), altitude ${f1(act.alt)}\u00b0`;
    const why=hidden
      ?`At high tide the Moon was on the opposite side of the Earth from you. The Moon pulls the water toward itself, and it pulls the Earth itself a little away from the water on the far side, so there is a second bulge of sea there. That is why most beaches have <b>two</b> high tides every day.`
      :`At high tide the Moon was right on your meridian, the line from due north to due south through the point overhead, ${f1(act.alt)}\u00b0 up in the ${compass(act.az)==="N"?"north":"south"}. The Moon pulls the sea toward itself and makes a bulge of water, and you were standing under the bulge.`;
    return `<div class="presult"><p class="pbig">${head}</p>
      ${tideScene(!hidden)}
      <table class="lantab"><tbody>
        <tr><td>Your answer</td><td>${yours}</td></tr>
        <tr><td>The Moon at high tide</td><td>${truth}</td></tr>
        <tr><td>The Moon\u2019s phase</td><td>${moonSvg(m.illum,m.waxing,22)} ${m.phase} (${Math.round(m.illum*100)}% lit)</td></tr>
      </tbody></table>
      <p class="note">${why}</p>
      <p class="note">${pv.tides.length>1?`The other high tide on this date is at ${stamp(pv.tides[(pv.tideIdx+1)%pv.tides.length].ms).time}, about 12 hours 25 minutes ${pv.tides[(pv.tideIdx+1)%pv.tides.length].ms>m.ms?"later":"earlier"}.`:`The next high tide in this pretend ocean is about 12 hours 25 minutes later, at ${nx.time} on ${nx.day}.`} The tides are a little later each day because the Moon rises later each day. Real beaches run a bit behind the Moon and depend on the shape of the coast, so check a local tide chart for real times.</p></div>`;
  }
  function histHTML(){
    const h=state.preds;
    if(!h.length)return `<p class="note" style="margin:0">No guesses yet. Your results are kept on this device.</p>`;
    const nums=h.filter(x=>typeof x.dist==="number");
    const avg=nums.length?nums.reduce((a,x)=>a+x.dist,0)/nums.length:null,best=nums.length?Math.min(...nums.map(x=>x.dist)):null;
    const rows=h.slice(0,10).map(x=>{
      const moon=x.body==="Moon";
      const guess=x.below?"far side of Earth":`${f1(x.gAz)}\u00b0, ${f1(x.gAlt)}\u00b0`;
      const ans=moon&&x.aAlt<=0?"hidden (far side)":`${f1(x.aAlt)}\u00b0`;
      return `<tr><td>${moon?"Moon":"Sun"}</td><td>${esc(x.date)}</td><td>${esc(x.place||"")}</td><td>${guess}</td><td>${ans}</td><td><b>${typeof x.dist==="number"?f1(x.dist)+"\u00b0":"\u2014"}</b></td></tr>`;
    }).join("");
    return `<p class="note" style="margin-top:0">${h.length} guess${h.length===1?"":"es"}.${avg==null?"":` Average miss ${f1(avg)}\u00b0, best ${f1(best)}\u00b0.`}</p><div class="ptab"><table class="lantab"><thead><tr><th>Body</th><th>Date</th><th>Place</th><th>Guess (az, alt)</th><th>Answer alt</th><th>Off by</th></tr></thead><tbody>${rows}</tbody></table></div>${h.length>10?`<p class="note">Showing the latest 10.</p>`:""}`;
  }
  function syncFace(){
    document.querySelectorAll(".seg button[data-pphi]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.pphi===Math.round(pv.phi)%360)));
  }
  const guessTxt=()=>pv.guess.below?"":`azimuth ${f1(pv.guess.az)}\u00b0 (${compass(pv.guess.az)}), altitude ${f1(pv.guess.alt)}\u00b0`;
  function statusMsg(){
    const sun=isSun();
    if(sun&&!sunNoon().up)return `On ${dateLong(pv.date)} the Sun stays below the horizon at ${place()}, even at noon. Pick another date or location.`;
    if(!sun&&!pv.moon)return `No high tide was found on ${dateLong(pv.date)}. Try another date.`;
    if(pv.revealed)return "";
    if(pv.guess&&pv.guess.below)return "You said the Moon is under your feet, on the far side of the Earth. Press Check my prediction, or click the dome to pin it there instead.";
    if(pv.guess)return `Your ${sun?"guess":"pin"}: ${guessTxt()}. Click again to move it, or press Check my prediction.`;
    if(sun)return `Click on the dome where you think the Sun will be at high noon on ${dateLong(pv.date)} at ${place()}. Drag sideways to turn the globe, or use the Face buttons to look from another side.`;
    return `Click the dome to drop a pin where the Moon is at ${stamp(pv.moon.ms).time}, the moment of high tide, or press \u201cThe Moon is under my feet\u201d if it is on the far side of the Earth. Drag sideways to turn the globe.`;
  }
  function sync(){
    const sun=isSun();
    $("pmSun").setAttribute("aria-pressed",String(sun));$("pmMoon").setAttribute("aria-pressed",String(!sun));
    $("pScenario").hidden=sun;$("pBelow").hidden=sun;
    $("pIntro").innerHTML=sun
      ?`You are the small figure at the center of the sky. At <b>high noon</b>, the moment the Sun is at its highest, where will it be? Click the spot on the dome where you think it will be, then check how close you got.`
      :`You are the small figure at the center of the sky, standing at the beach. Pick a date and you will be given the <b>high tide</b> times at your location for that day. Drop a pin on the dome where the Moon is at the moment of high tide, then check.`;
    if(!sun){
      const tides=pv.tides||[];
      if(!tides.length)$("pScenario").innerHTML=`<p style="margin:0">No high tide was found on ${esc(dateLong(pv.date))}. Try another date.</p>`;
      else{
        const ab=tzAbbr(tides[0].ms,state.loc.tz),times=tides.map(t=>stamp(t.ms).time),list=times.map(x=>`<b>${esc(x)}</b>`).join(" and ");
        const btns=tides.map((t,i)=>`<button type="button" data-tide="${i}" aria-pressed="${i===pv.tideIdx}">${esc(times[i])}</button>`).join("");
        $("pScenario").innerHTML=`<p class="pbig" style="margin:0">High tide${tides.length>1?"s":""}: ${list} ${esc(ab)}</p>
          <p style="margin:2px 0 0">${esc(place())}, ${esc(dateLong(pv.date))}</p>
          ${tides.length>1?`<div class="pbar" style="margin:8px 0 0"><span class="muted">Plot the Moon at:</span><div class="seg" role="group" aria-label="Which high tide to plot">${btns}</div></div>`:""}
          <p class="note" style="margin:6px 0 0">In this game the sea behaves perfectly. Real beaches run a little late.</p>`;
      }
    }
    $("pLoc").textContent=place();
    if($("pDate").value!==pv.date)$("pDate").value=pv.date;
    $("pTilt").value=pv.tilt;$("pHint").checked=pv.hint;syncFace();
    $("pCheck").hidden=pv.revealed;$("pAgain").hidden=!pv.revealed;
    $("pAgain").textContent=sun?"Try again":(pv.tides.length>1?"Try the other high tide":"Try a random date");
    $("pCheck").disabled=!(pv.guess&&!pv.revealed&&playable());
    $("pBelow").disabled=pv.revealed;
    $("pAz").disabled=$("pAlt").disabled=pv.revealed||!playable();
    if(pv.guess&&!pv.guess.below){
      if(document.activeElement!==$("pAz"))$("pAz").value=f1(pv.guess.az);
      if(document.activeElement!==$("pAlt"))$("pAlt").value=f1(pv.guess.alt);
    }else{$("pAz").value="";$("pAlt").value="";}
    $("pStatus").textContent=statusMsg();
    $("pResult").innerHTML=pv.revealed?resultHTML():"";
    $("pPrintBar").hidden=!(pv.revealed&&pv.guess&&playable());
    $("pHist").innerHTML=histHTML();
    $("pdome").setAttribute("aria-label",pv.guess?(pv.guess.below?"Sky globe. Your answer: the Moon is under your feet.":`Sky globe. Your pin is azimuth ${f1(pv.guess.az)} degrees, altitude ${f1(pv.guess.alt)} degrees.`):"Sky globe with a person at the center. Click to place your pin.");
  }
  function update(){render();sync();}
  function newRound(){
    pv.guess=null;pv.revealed=false;
    if(isSun())pv.key=locKey()+"|"+pv.date;else setTides();
    update();
  }
  function setMode(m){
    if(pv.mode===m)return;
    pv.mode=m;pv.guess=null;pv.revealed=false;
    if(m==="moon")setTides();
    else pv.key=locKey()+"|"+pv.date;
    update();
  }
  function check(){
    if(!pv.guess||!playable()||pv.revealed)return;
    const act=answer(),sun=isSun();
    let dist=null;
    if(sun)dist=angDist(pv.guess.az,pv.guess.alt,act.az,act.alt);
    else if(pv.guess.below)dist=act.up?null:0;
    else dist=act.up?angDist(pv.guess.az,pv.guess.alt,act.az,act.alt):null;
    pv.revealed=true;
    const date=pv.date;
    state.preds.unshift({t:Date.now(),body:sun?"Sun":"Moon",date,place:state.loc.name||"",lat:state.loc.lat,lon:state.loc.lon,
      below:!!pv.guess.below,gAz:pv.guess.below?null:+pv.guess.az.toFixed(1),gAlt:pv.guess.below?null:+pv.guess.alt.toFixed(1),
      aAz:+act.az.toFixed(1),aAlt:+act.alt.toFixed(1),dist:dist==null?null:+dist.toFixed(1)});
    state.preds=state.preds.slice(0,100);save();update();
  }
  // pointer: drag turns the globe, a tap or click places the pin
  const wrap=$("pWrap"),svg=$("pdome");
  const toVB=(x,y)=>{const m=svg.getScreenCTM();if(!m)return null;const pt=svg.createSVGPoint();pt.x=x;pt.y=y;const q=pt.matrixTransform(m.inverse());return {x:q.x,y:q.y};};
  const hitAt=(cx0,cy0)=>{const q=toVB(cx0,cy0);return q?proj().inv(q.x,q.y):null;};
  let st0=null,moved=false;
  function hideGhost(){const g=$("pGhost");if(g)g.setAttribute("visibility","hidden");$("pHover").textContent="";}
  function hover(e){
    const g=$("pGhost");if(!g)return;
    if(pv.revealed||!playable()){hideGhost();return;}
    const hit=hitAt(e.clientX,e.clientY);if(!hit){hideGhost();return;}
    const p=proj().PA(hit.alt,hit.az);
    g.setAttribute("cx",f1(p.x));g.setAttribute("cy",f1(p.y));g.setAttribute("visibility","visible");
    $("pHover").textContent=`Pointer: azimuth ${f1(hit.az)}\u00b0 (${compass(hit.az)}), altitude ${f1(hit.alt)}\u00b0`;
  }
  wrap.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;st0={x:e.clientX,y:e.clientY,phi:pv.phi};moved=false;});
  wrap.addEventListener("pointermove",e=>{
    if(st0){
      const dx=e.clientX-st0.x,dy=e.clientY-st0.y;
      if(!moved&&Math.hypot(dx,dy)>5){moved=true;try{wrap.setPointerCapture(e.pointerId);}catch(_){}}
      if(moved){pv.phi=wrapAz(st0.phi-dx*0.45);render();syncFace();}
    }else if(e.pointerType==="mouse")hover(e);
  });
  const end=e=>{
    if(st0&&!moved&&e.type==="pointerup"){
      if(!pv.revealed&&playable()){
        const hit=hitAt(e.clientX,e.clientY);
        if(hit){pv.guess={az:hit.az,alt:hit.alt};update();}
        else $("pStatus").textContent="That spot is outside the sky. Click inside the dome.";
      }
    }
    st0=null;moved=false;
  };
  wrap.addEventListener("pointerup",end);
  wrap.addEventListener("pointercancel",end);
  wrap.addEventListener("pointerleave",()=>{if(!st0)hideGhost();});
  document.querySelectorAll(".seg button[data-pphi]").forEach(b=>b.addEventListener("click",()=>{pv.phi=+b.dataset.pphi;render();syncFace();}));
  $("pTilt").addEventListener("input",e=>{pv.tilt=+e.target.value;render();});
  $("pHint").addEventListener("change",e=>{pv.hint=e.target.checked;render();});
  $("pmSun").addEventListener("click",()=>setMode("sun"));
  $("pmMoon").addEventListener("click",()=>setMode("moon"));
  $("pDate").addEventListener("change",e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){pv.date=e.target.value;newRound();}});
  $("pRandom").addEventListener("click",()=>{pv.date=addDays("2026-01-01",Math.floor(Math.random()*365));newRound();});
  $("pScenario").addEventListener("click",e=>{const b=e.target.closest("button[data-tide]");if(b&&!isSun())selectTide(+b.dataset.tide);});
  $("pBelow").addEventListener("click",()=>{if(pv.revealed||!playable())return;pv.guess={below:true};update();});
  function fromInputs(){
    const a=parseFloat($("pAz").value),h=parseFloat($("pAlt").value);
    if(isFinite(a)&&isFinite(h)&&h>=0&&h<=90&&a>=0&&a<=360){pv.guess={az:wrapAz(a),alt:h};render();
      $("pCheck").disabled=pv.revealed||!playable();
      $("pStatus").textContent=statusMsg();}
  }
  $("pAz").addEventListener("input",fromInputs);$("pAlt").addEventListener("input",fromInputs);
  $("pCheck").addEventListener("click",check);
  $("pAgain").addEventListener("click",()=>{
    if(isSun()||pv.tides.length<=1){if(!isSun())pv.date=addDays("2026-01-01",Math.floor(Math.random()*365));newRound();}
    else selectTide(pv.tideIdx+1);
  });
  let pClearArmed=false;
  $("pClear").addEventListener("click",e=>{
    if(!state.preds.length)return;
    if(!pClearArmed){pClearArmed=true;e.target.textContent="Tap again to clear";setTimeout(()=>{pClearArmed=false;e.target.textContent="Clear history";},3500);return;}
    pClearArmed=false;e.target.textContent="Clear history";state.preds=[];save();sync();
  });
  /* ----- printable report: one labelled page with the figure, legend, numbers and explanation ----- */
  const PAL={"--card":"#ffffff","--ink":"#1b2557","--muted":"#5d6284","--line":"#cfc3a3","--soft":"#f4eedf","--sky":"#e3edf1","--dome":"#1b2557","--ref":"#2e3f93","--robe":"#c0472f","--accent":"#2e3f93"};
  const pal=t=>t.replace(/var\((--[\w-]+)\)/g,(m,v)=>PAL[v]||"#888");
  const RFONT="Georgia,'Times New Roman',serif";
  let mctx=null;try{mctx=document.createElement("canvas").getContext("2d");}catch(e){}
  const tw=(t,size,bold)=>{if(mctx){mctx.font=`${bold?"bold ":""}${size}px ${RFONT}`;return mctx.measureText(t).width;}return t.length*size*0.54;};
  function wrapText(text,size,maxW,bold){
    const out=[];let cur="";
    for(const w of String(text).split(/\s+/)){const t=cur?cur+" "+w:w;if(cur&&tw(t,size,bold)>maxW){out.push(cur);cur=w;}else cur=t;}
    if(cur)out.push(cur);return out.length?out:[""];
  }
  function personEl(cx,cy){
    return `<g stroke="#1b2557" stroke-width="1.7" stroke-linecap="round" fill="none"><circle cx="${f1(cx)}" cy="${f1(cy-12)}" r="4.6" fill="#fff"/><path d="M${f1(cx)} ${f1(cy-7.4)} V${f1(cy+4)} M${f1(cx-6.5)} ${f1(cy-2)} H${f1(cx+6.5)} M${f1(cx)} ${f1(cy+4)} L${f1(cx-4.6)} ${f1(cy+12)} M${f1(cx)} ${f1(cy+4)} L${f1(cx+4.6)} ${f1(cy+12)}"/></g>`;
  }
  function reportSvg(){
    const sun=isSun(),act=answer(),gs=pv.guess,L=state.loc,tz=L.tz,W=850,M=36,CW=W-2*M,m=pv.moon;
    const coords=`${Math.abs(L.lat).toFixed(3)}\u00b0 ${L.lat>=0?"N":"S"}, ${Math.abs(L.lon).toFixed(3)}\u00b0 ${L.lon>=0?"E":"W"}`;
    const hh=ms=>fmtTime(ms,tz).slice(0,5);
    let y=0,s="";
    const para=(text,size,o)=>{
      o=o||{};const lh=size*1.38,ls=wrapText(text,size,o.w||CW,o.bold);
      for(const l of ls){y+=lh;s+=`<text x="${o.x==null?M:o.x}" y="${f1(y)}" font-size="${size}" ${o.bold?'font-weight="bold" ':""}${o.i?'font-style="italic" ':""}fill="${o.fill||"#1b2557"}">${esc(l)}</text>`;}
      y+=o.after==null?4:o.after;
    };
    const heading=t=>{y+=10;s+=`<text x="${M}" y="${f1(y+16)}" font-size="16" font-weight="bold" fill="#c0472f">${esc(t)}</text><line x1="${M}" y1="${f1(y+22)}" x2="${W-M}" y2="${f1(y+22)}" stroke="#cfc3a3"/>`;y+=30;};
    const rows=(arr,labelW)=>{
      const size=13.5,lh=size*1.38;
      for(const [k,v] of arr){
        const vl=wrapText(v,size,CW-labelW-8),top=y;
        s+=`<text x="${M}" y="${f1(top+lh)}" font-size="${size}" font-weight="bold" fill="#5d6284">${esc(k)}</text>`;
        vl.forEach((l,i)=>{s+=`<text x="${M+labelW}" y="${f1(top+lh*(i+1))}" font-size="${size}" fill="#1b2557">${esc(l)}</text>`;});
        y=top+lh*vl.length+6;
        s+=`<line x1="${M}" y1="${f1(y-2)}" x2="${W-M}" y2="${f1(y-2)}" stroke="#e6dcc0"/>`;
      }
    };
    // title band
    s+=`<rect x="0" y="0" width="${W}" height="62" fill="#1b2557"/><text x="${M}" y="41" font-size="30" fill="#fbf7ec">Caelus</text><text x="${W-M}" y="39" font-size="16" fill="#fbf7ec" text-anchor="end">${sun?"Sun prediction report":"Moon and tide prediction report"}</text>`;
    y=62+8;
    para(sun?"Task: predict where the Sun will be at high noon, the moment it is highest in the sky and crosses the north\u2013south line (the meridian), and mark that spot on the sky dome.":"Task: for the high tide on this date, predict where the Moon is at the moment of high tide and mark it on the sky dome, or answer that it is under your feet on the far side of the Earth.",14,{bold:true,after:8});
    // facts
    let info;
    if(sun){
      const act2=sunNoon();
      info=[["Place",place()],["Coordinates",coords],["Time zone",tz],["Date",dateLong(pv.date)],["High noon (Sun highest)",`${hh(act2.d.lanMs)} ${tzAbbr(act2.d.lanMs,tz)}, local clock time`],["Sun\u2019s declination that day",fdeg(act2.d.dec)]];
    }else{
      const ab=tzAbbr(m.ms,tz);
      info=[["Place",place()],["Coordinates",coords],["Time zone",tz],["Date",dateLong(pv.date)],["High tides that day",pv.tides.map(t=>hh(t.ms)).join(" and ")+" "+ab],["Tide plotted",`${hh(m.ms)} ${ab}${pv.tides.length>1?` (high tide ${pv.tideIdx+1} of ${pv.tides.length})`:""}`],["Moon\u2019s phase",`${m.phase}, ${Math.round(m.illum*100)}% lit`]];
    }
    rows(info,236);
    y+=8;
    // the figure
    const sv=$("pdome"),vb=sv.viewBox.baseVal,k=CW/vb.width,dh=vb.height*k;
    const inner=pal(sv.innerHTML.replace(/<circle id="pGhost"[^>]*>(<\/circle>)?/,""));
    s+=`<clipPath id="rpClip"><rect x="${M}" y="${f1(y)}" width="${CW}" height="${f1(dh)}"/></clipPath><rect x="${M}" y="${f1(y)}" width="${CW}" height="${f1(dh)}" fill="#ffffff" stroke="#cfc3a3"/><g clip-path="url(#rpClip)"><g transform="translate(${M} ${f1(y)}) scale(${k.toFixed(4)})">${inner}</g></g>`;
    y+=dh+4;
    para(`Figure. The sky dome seen from outside, with the ${compass(pv.phi)} side nearest the viewer and the dome tilted ${pv.tilt}\u00b0. The horizon is the ellipse; the zenith (straight up) is marked with a small cross.`,11.5,{i:true,fill:"#5d6284",after:6});
    // legend
    heading("How to read the figure");
    const items=[];
    items.push([(x,yy)=>personEl(x,yy),"You, standing at the center of the sky."]);
    items.push([(x,yy)=>`<text x="${f1(x)}" y="${f1(yy+7)}" font-size="20" font-weight="bold" text-anchor="middle" fill="#1b2557">N</text>`,"N, E, S, W: the compass points on the horizon. Numbers such as 045\u00b0 are azimuths, the bearing measured clockwise from north."]);
    items.push([(x,yy)=>`<ellipse cx="${f1(x)}" cy="${f1(yy)}" rx="15" ry="6" fill="#f4eedf" stroke="#1b2557" stroke-width="1.8"/>`,"The solid ellipse is the horizon (altitude 0\u00b0)."]);
    items.push([(x,yy)=>`<ellipse cx="${f1(x)}" cy="${f1(yy)}" rx="12" ry="5" fill="none" stroke="#5d6284" stroke-width="1" stroke-dasharray="2 3"/>`,"Dashed rings show altitude above the horizon every 15\u00b0. Their labels (15\u00b0, 30\u00b0, \u2026) run along the nearest side."]);
    items.push([(x,yy)=>`<line x1="${f1(x-16)}" y1="${f1(yy)}" x2="${f1(x+16)}" y2="${f1(yy)}" stroke="#1b2557" stroke-opacity=".38" stroke-width="2"/>`,"Paler lines are parts of the figure on the far side of the dome."]);
    if(gs&&gs.below)items.push([(x,yy)=>`<circle cx="${f1(x)}" cy="${f1(yy)}" r="10" fill="#fff" stroke="#c0472f" stroke-width="2" stroke-dasharray="3 2.5"/>`,"Dashed red ring below the figure: your answer, that the Moon is under your feet."]);
    else if(gs)items.push([(x,yy)=>sun?sunGlyph({x,y:yy},"guess"):`<circle cx="${f1(x)}" cy="${f1(yy)}" r="10" fill="#fff" stroke="#c0472f" stroke-width="2" stroke-dasharray="3 2.5"/>`,`Dashed red ${sun?"sun":"ring"}: your ${sun?"guess":"pin"} (azimuth ${f1(gs.az)}\u00b0, altitude ${f1(gs.alt)}\u00b0).`]);
    if(sun&&act.up)items.push([(x,yy)=>sunGlyph({x,y:yy},"actual"),`Filled Sun: where the Sun really is at high noon (azimuth ${f1(act.az)}\u00b0, altitude ${f1(act.alt)}\u00b0).`]);
    if(sun&&act.up)items.push([(x,yy)=>`<line x1="${f1(x-18)}" y1="${f1(yy)}" x2="${f1(x+18)}" y2="${f1(yy)}" stroke="#d9940a" stroke-width="2" stroke-dasharray="7 4"/>`,"Dashed amber arc: the Sun\u2019s whole path across the sky that day, rising on one side and setting on the other."]);
    if(!sun&&act.up)items.push([(x,yy)=>moonEl(x,yy,10,m.illum,m.waxing,1),`Moon symbol (lit part shown as it would look): where the Moon really is at the moment of high tide (azimuth ${f1(act.az)}\u00b0, altitude ${f1(act.alt)}\u00b0).`]);
    if(!sun&&!act.up)items.push([(x,yy)=>moonEl(x,yy,10,m.illum,m.waxing,.55),"Faded Moon below the horizon: the Moon is on the far side of the Earth at this high tide, hidden from view."]);
    if(!sun)items.push([(x,yy)=>`<line x1="${f1(x-18)}" y1="${f1(yy)}" x2="${f1(x+18)}" y2="${f1(yy)}" stroke="#3c8fc0" stroke-width="2" stroke-dasharray="7 4"/>`,"Dashed blue line: the Moon\u2019s path across the sky over the 26 hours around the tide, drawn only while it is above the horizon."]);
    if(act.up&&gs&&!gs.below)items.push([(x,yy)=>`<line x1="${f1(x-18)}" y1="${f1(yy)}" x2="${f1(x+18)}" y2="${f1(yy)}" stroke="#c0472f" stroke-width="1.8" stroke-dasharray="4 3"/>`,"Dashed red line: the shortest path across the sky from your pin to the real position. Its length is your error."]);
    if(pv.hint)items.push([(x,yy)=>`<line x1="${f1(x-18)}" y1="${f1(yy)}" x2="${f1(x+18)}" y2="${f1(yy)}" stroke="#2e3f93" stroke-width="1.6" stroke-dasharray="6 4"/>`,"Dashed blue-violet line: the north\u2013south line (meridian) through the point overhead."]);
    const colW=(CW-24)/2,size=12.5,lh=size*1.38;
    for(let i=0;i<items.length;i+=2){
      const pair=items.slice(i,i+2).map(it=>({it,ls:wrapText(it[1],size,colW-48)}));
      const rowH=Math.max(36,...pair.map(p=>p.ls.length*lh+8));
      pair.forEach((p,j)=>{
        const x0=M+j*(colW+24),cy=y+rowH/2;
        s+=p.it[0](x0+20,cy);
        p.ls.forEach((l,n)=>{s+=`<text x="${f1(x0+46)}" y="${f1(y+(rowH-p.ls.length*lh)/2+lh*(n+1)-3)}" font-size="${size}" fill="#1b2557">${esc(l)}</text>`;});
      });
      y+=rowH;
    }
    // results
    heading("Result");
    let res=[];
    const expl=[];
    if(sun&&act.up&&gs){
      const dist=angDist(gs.az,gs.alt,act.az,act.alt),dAlt=gs.alt-act.alt,dAz=((gs.az-act.az+540)%360)-180;
      const dirW=act.az===180?(dAz>0?"west":"east"):(dAz>0?"east":"west");
      const altTxt=Math.abs(dAlt)<0.5?"about right":`${f1(Math.abs(dAlt))}\u00b0 too ${dAlt>0?"high":"low"}`;
      const azTxt=Math.abs(dAz)<0.5?"on the line":`${f1(Math.abs(dAz))}\u00b0 too far ${dirW}`;
      res=[["Your prediction",`azimuth ${f1(gs.az)}\u00b0 (${compass(gs.az)}), altitude ${f1(gs.alt)}\u00b0`],["The Sun at high noon",`azimuth ${f1(act.az)}\u00b0 (due ${act.az===180?"south":"north"}), altitude ${f1(act.alt)}\u00b0`],["Difference",`altitude: ${altTxt}; direction: ${azTxt}`],["Angular distance",`${f1(dist)}\u00b0 between your prediction and the Sun`]];
      expl.push(`At local noon the Sun crosses the meridian, the line from due north to due south through the point overhead, so it stands due ${act.az===180?"south":"north"} of the observer. Its height is 90\u00b0 \u2212 |latitude \u2212 declination| = 90\u00b0 \u2212 |${fdeg(L.lat)} \u2212 (${fdeg(act.d.dec)})| = ${f1(act.alt)}\u00b0.`);
      expl.push(`The Sun is highest at ${hh(act.d.lanMs)} ${tzAbbr(act.d.lanMs,tz)}, not at 12:00 on the clock, because of time zones, daylight saving time and the equation of time.`);
    }else if(!sun&&gs){
      const hidden=!act.up;
      const yours=gs.below?"The Moon is under my feet (on the far side of the Earth)":`azimuth ${f1(gs.az)}\u00b0 (${compass(gs.az)}), altitude ${f1(gs.alt)}\u00b0`;
      const truth=hidden?`hidden ${f1(Math.abs(act.alt))}\u00b0 below the horizon, on the far side of the Earth`:`azimuth ${f1(act.az)}\u00b0 (${compass(act.az)}), altitude ${f1(act.alt)}\u00b0`;
      let diff;
      if(gs.below&&hidden)diff="Correct: the Moon was under the observer\u2019s feet.";
      else if(gs.below)diff="Incorrect: the Moon was up in the sky.";
      else if(hidden)diff="Incorrect: the Moon was on the far side of the Earth, below the horizon.";
      else diff=`${f1(angDist(gs.az,gs.alt,act.az,act.alt))}\u00b0 between the pin and the Moon`;
      res=[["Your answer",yours],["The Moon at high tide",truth],["Difference",diff]];
      expl.push(hidden?"At this high tide the Moon was on the opposite side of the Earth from the observer. The Moon pulls the water toward itself and pulls the Earth a little away from the water on the far side, so there is a second bulge of sea there. That is why most beaches have two high tides every day.":`At this high tide the Moon was on the observer\u2019s meridian, the line from due north to due south through the point overhead, ${f1(act.alt)}\u00b0 up in the ${compass(act.az)==="N"?"north":"south"}. The Moon pulls the sea toward itself and makes a bulge of water, and the observer was standing under the bulge.`);
      const oth=pv.tides.length>1?pv.tides[(pv.tideIdx+1)%pv.tides.length]:null,nx=m.ms+12.4206*36e5;
      expl.push(oth?`The other high tide on this date is at ${hh(oth.ms)} ${tzAbbr(oth.ms,tz)}, about 12 hours 25 minutes ${oth.ms>m.ms?"later":"earlier"}. Tides come later each day because the Moon rises later each day.`:`The next high tide in this pretend ocean is about 12 hours 25 minutes later, at ${hh(nx)} ${tzAbbr(nx,tz)}. Tides come later each day because the Moon rises later each day.`);
      expl.push("Assumption: the tide times here are for a \u201cpretend ocean\u201d in which high water happens exactly when the Moon crosses the observer\u2019s meridian, above or below the horizon. Real tides lag the Moon by an amount that depends on the coastline, so use a local tide table for real predictions.");
    }
    rows(res,236);
    if(expl.length){heading("What this shows");for(const t of expl)para(t,13,{after:6});}
    // footer
    y+=6;s+=`<line x1="${M}" y1="${f1(y)}" x2="${W-M}" y2="${f1(y)}" stroke="#cfc3a3"/>`;y+=4;
    para("Method. Positions are computed in the browser with the algorithms in Jean Meeus, Astronomical Algorithms, 2nd ed. (Willmann-Bell, 1998): chapter 25 for the Sun and chapter 47 for the Moon. Expect about \u00b10.05\u00b0 in altitude and azimuth and \u00b12 minutes in time. Altitude is the height of the body\u2019s center above the horizon (the Sun without atmospheric refraction; the Moon as seen from the observer\u2019s location, topocentric). Azimuth is the true compass bearing, measured clockwise from north. All times are 24-hour local clock time.",10.5,{fill:"#5d6284",after:4});
    const now=new Date();let when;try{when=now.toLocaleString("en-GB",{timeZone:tz,dateStyle:"long",timeStyle:"short",hourCycle:"h23"})+" "+tzAbbr(+now,tz);}catch(e){when=now.toISOString();}
    para(`Made with Caelus on ${when}.`,10.5,{fill:"#5d6284",after:0});
    return {inner:pal(s),W,H:Math.ceil(y+M*0.8)};
  }
  const reportFile=()=>`caelus-${isSun()?"sun":"moon-tide"}-prediction-${pv.date}${isSun()?"":"-"+stamp(pv.moon.ms).time.replace(":","")}.png`;
  function reportDoc(r,extra){return `<svg xmlns="http://www.w3.org/2000/svg" ${extra} viewBox="0 0 ${r.W} ${r.H}" font-family="${RFONT}"><rect width="${r.W}" height="${r.H}" fill="#ffffff"/>${r.inner}</svg>`;}
  async function reportBlob(r){
    const S=2.2,img=new Image();
    const loaded=new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error("img"));});
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(reportDoc(r,`width="${Math.round(r.W*S)}" height="${Math.round(r.H*S)}"`));
    await Promise.race([loaded,new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),6000))]);
    const c=document.createElement("canvas");c.width=Math.round(r.W*S);c.height=Math.round(r.H*S);
    const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
    return await new Promise((res,rej)=>{try{c.toBlob(b=>b?res(b):rej(new Error("blob")),"image/png");}catch(e){rej(e);}});
  }
  let rpUrl=null,rpBlob=null;
  function closeOverlay(){
    $("reportOverlay").hidden=true;document.body.style.overflow="";
    if(rpUrl){URL.revokeObjectURL(rpUrl);rpUrl=null;}
    rpBlob=null;$("rpImg").removeAttribute("src");$("rpImg").hidden=true;$("rpSvg").innerHTML="";
  }
  async function openOverlay(){
    const r=reportSvg();
    $("reportOverlay").hidden=false;document.body.style.overflow="hidden";
    $("rpMsg").textContent="Preparing the report\u2026";$("rpImg").hidden=true;$("rpSvg").innerHTML="";
    try{
      rpBlob=await reportBlob(r);
      if($("reportOverlay").hidden)return;
      rpUrl=URL.createObjectURL(rpBlob);$("rpImg").src=rpUrl;$("rpImg").hidden=false;
      $("rpMsg").textContent="Press and hold the image to save or share it, then print it from your photos or files. You can also use the buttons.";
    }catch(e){
      if($("reportOverlay").hidden)return;
      $("rpSvg").innerHTML=reportDoc(r,'style="width:100%;height:auto;display:block;background:#fff"');
      $("rpMsg").textContent="A picture could not be made here, so this is the report itself. Use Print, or take a screenshot.";
    }
  }
  async function saveReportImage(){
    if(!pv.revealed||!pv.guess){toast("Check your prediction first.");return;}
    let blob;
    try{blob=await reportBlob(reportSvg());}catch(e){openOverlay();return;}
    const ns=await downloadsNS();
    if(ns===null){openOverlay();return;}
    offerFile(reportFile(),blob,"Prediction image");
  }
  function printReport(){
    if(!pv.revealed||!pv.guess){toast("Check your prediction first.");return;}
    try{
      const r=reportSvg();
      $("printSheet").innerHTML=reportDoc(r,'style="width:100%;height:auto;max-height:9.7in;display:block"');
      document.documentElement.classList.add("printing");
      window.print();
    }catch(e){document.documentElement.classList.remove("printing");}
  }
  window.addEventListener("afterprint",()=>{document.documentElement.classList.remove("printing");const ps=$("printSheet");if(ps)ps.innerHTML="";});
  $("pPrint").addEventListener("click",()=>{printReport();openOverlay();});
  $("pSaveImg").addEventListener("click",saveReportImage);
  $("rpPrint").addEventListener("click",printReport);
  $("rpSave").addEventListener("click",()=>{if(!rpBlob){toast("The image is still being made, or could not be made here.");return;}offerFile(reportFile(),rpBlob,"Prediction image");});
  $("rpClose").addEventListener("click",closeOverlay);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("reportOverlay").hidden)closeOverlay();});
  // pages
  function showPage(which){
    const p=which==="predict";
    $("pageDome").hidden=p;$("pagePredict").hidden=!p;
    $("tabDome").setAttribute("aria-selected",String(!p));$("tabPredict").setAttribute("aria-selected",String(p));
    if(p){
      const k=locKey()+"|"+pv.date+(isSun()?"":"|moon");
      if(pv.key&&pv.key!==k){pv.guess=null;pv.revealed=false;}
      if(!isSun()&&(pv.key!==k||!pv.tides.length))setTides();
      pv.key=k;update();
    }else renderDome();
  }
  $("tabDome").addEventListener("click",()=>showPage("dome"));
  $("tabPredict").addEventListener("click",()=>showPage("predict"));
  $("pChangeLoc").addEventListener("click",()=>{showPage("dome");const el=$("cityPane").hidden?$("coordPane"):$("cityPane");el.scrollIntoView({behavior:"smooth",block:"center"});});
  const fromHash=()=>{
    if(location.hash==="#moon"){pv.mode="moon";setTides();showPage("predict");}
    else if(location.hash==="#predict"){if(pv.mode!=="sun")setMode("sun");showPage("predict");}
    else if(location.hash==="#dome")showPage("dome");
  };
  window.addEventListener("hashchange",fromHash);
  pv.key=locKey()+"|"+pv.date;
  if(location.hash==="#predict"||location.hash==="#moon")fromHash();
})();

const t=todayISO();
$("fDate").value=t;$("starDate").value=t;$("dDate").value=t;$("sFrom").value=t;$("sTo").value=addDays(t,28);
$("eDate").value=t;clock.date=t;
(function(){const p=fmtTime(Date.now(),state.loc.tz).split(":").map(Number);if(p.length>=2&&p.every(n=>isFinite(n)))clock.min=p[0]*60+p[1];})();
syncClockUI();
(function(){
  let zones=[];
  try{zones=Intl.supportedValuesOf("timeZone");}catch(e){}
  if(!zones||!zones.length)zones=["Pacific/Honolulu","America/Anchorage","America/Los_Angeles","America/Denver","America/Phoenix","America/Chicago","America/New_York","America/Halifax","America/St_Johns","America/Mexico_City","America/Bogota","America/Lima","America/Caracas","America/Santiago","America/Sao_Paulo","America/Argentina/Buenos_Aires","Atlantic/Azores","Europe/London","Europe/Lisbon","Europe/Madrid","Europe/Paris","Europe/Berlin","Europe/Rome","Europe/Athens","Europe/Istanbul","Africa/Cairo","Africa/Lagos","Africa/Johannesburg","Africa/Nairobi","Asia/Dubai","Asia/Karachi","Asia/Kolkata","Asia/Bangkok","Asia/Singapore","Asia/Shanghai","Asia/Tokyo","Asia/Seoul","Australia/Perth","Australia/Sydney","Pacific/Auckland","Pacific/Guam"];
  if(!zones.includes("UTC"))zones=["UTC"].concat(zones);
  const now=Date.now();
  $("tzList").innerHTML=zones.map(z=>{
    const m=Math.round(tzOffsetMin(now,z)),a=Math.abs(m);
    const off=(m<0?"−":"+")+String(Math.floor(a/60)).padStart(2,"0")+":"+String(a%60).padStart(2,"0");
    return `<option value="${z}" label="${z.replace(/_/g," ")} (UTC${off})">`;
  }).join("");
})();
fillLoc();$("citySearch").value=state.loc.name||"";showPicked();setLocMode(state.locMode);resetForm();syncBodySeg();renderAll();updZoomUI();
})();
