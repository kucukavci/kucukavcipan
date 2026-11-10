var sub=function(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]},dot=function(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]},cr=function(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]},nz=function(a){var l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l]},ng=function(a){return[-a[0],-a[1],-a[2]]};
// ---- CSG ----
var EPS=1e-4;
function mkP(v,o){var n=nz(cr(sub(v[1],v[0]),sub(v[2],v[0])));return{v:v,pl:{n:n,w:dot(n,v[0])},c:o.c,o:o.i}}
function flip(p){return{v:p.v.slice().reverse(),pl:{n:ng(p.pl.n),w:-p.pl.w},c:p.c,o:p.o}}
function split(pl,p,cf,cb,F,B){var ty=[],pt=0,i;
 p.v.forEach(function(v){var t=dot(pl.n,v)-pl.w,k=t<-EPS?2:t>EPS?1:0;pt|=k;ty.push(k)});
 if(pt==0)(dot(pl.n,p.pl.n)>0?cf:cb).push(p);else if(pt==1)F.push(p);else if(pt==2)B.push(p);
 else{var fv=[],bv=[],n=p.v.length;for(i=0;i<n;i++){var j=(i+1)%n,vi=p.v[i],vj=p.v[j];
  if(ty[i]!=2)fv.push(vi);if(ty[i]!=1)bv.push(vi);
  if((ty[i]|ty[j])==3){var t=(pl.w-dot(pl.n,vi))/dot(pl.n,sub(vj,vi)),v=[vi[0]+(vj[0]-vi[0])*t,vi[1]+(vj[1]-vi[1])*t,vi[2]+(vj[2]-vi[2])*t];fv.push(v);bv.push(v)}}
  if(fv.length>=3)F.push({v:fv,pl:p.pl,c:p.c,o:p.o});if(bv.length>=3)B.push({v:bv,pl:p.pl,c:p.c,o:p.o})}}
function Node(p){this.pl=null;this.f=null;this.b=null;this.p=[];if(p)this.build(p)}
Node.prototype={
 inv:function(){this.p=this.p.map(flip);if(this.pl)this.pl={n:ng(this.pl.n),w:-this.pl.w};if(this.f)this.f.inv();if(this.b)this.b.inv();var t=this.f;this.f=this.b;this.b=t},
 clip:function(ps){if(!this.pl)return ps.slice();var f=[],b=[],s=this;ps.forEach(function(p){split(s.pl,p,f,b,f,b)});f=this.f?this.f.clip(f):f;b=this.b?this.b.clip(b):[];return f.concat(b)},
 clipTo:function(n){this.p=n.clip(this.p);if(this.f)this.f.clipTo(n);if(this.b)this.b.clipTo(n)},
 all:function(){var r=this.p.slice();if(this.f)r=r.concat(this.f.all());if(this.b)r=r.concat(this.b.all());return r},
 build:function(ps){if(!ps.length)return;if(!this.pl)this.pl=ps[0].pl;var f=[],b=[],s=this;ps.forEach(function(p){split(s.pl,p,s.p,s.p,f,b)});
  if(f.length){if(!this.f)this.f=new Node();this.f.build(f)}if(b.length){if(!this.b)this.b=new Node();this.b.build(b)}}};
function uni(a,b){var A=new Node(a),B=new Node(b);A.clipTo(B);B.clipTo(A);B.inv();B.clipTo(A);B.inv();A.build(B.all());return A.all()}
function dif(a,b){var A=new Node(a),B=new Node(b);A.inv();A.clipTo(B);B.clipTo(A);B.inv();B.clipTo(A);B.inv();A.build(B.all());A.inv();return A.all()}
// ---- primitifler ----
function ngon(n){var r=[];for(var i=0;i<n;i++){var a=i/n*2*Math.PI;r.push([.5*Math.cos(a),.5*Math.sin(a)])}return r}
var SH={box:[[.5,-.5],[.5,.5],[-.5,.5],[-.5,-.5]],cyl:ngon(36),tri:[[.5,-.5],[.5,.5],[-.5,.5]],hex:ngon(6)};
var NAMES={box:"Kutu",cyl:"Silindir",tri:"Üçgen",hex:"Altıgen"};
function tf(p,o){var d=Math.PI/180,x=p[0],y=p[1],z=p[2],c,s,t;
 c=Math.cos(o.rx*d);s=Math.sin(o.rx*d);t=y*c-z*s;z=y*s+z*c;y=t;
 c=Math.cos(o.ry*d);s=Math.sin(o.ry*d);t=x*c+z*s;z=-x*s+z*c;x=t;
 c=Math.cos(o.rz*d);s=Math.sin(o.rz*d);t=x*c-y*s;y=x*s+y*c;x=t;
 return[x+o.x,y+o.y,z+o.z]}
function gen(o,i){var s=SH[o.t],n=s.length,ps=[],sx=Math.max(.1,o.sx),sy=Math.max(.1,o.sy),sz=Math.max(.1,o.sz),m={c:hex2(o.col),i:i};
 var T=function(x,y,z){return tf([(x-o.ax*.5)*sx,(y-o.ay*.5)*sy,(z-o.az*.5)*sz],o)};
 ps.push(mkP(s.map(function(p){return T(p[0],-.5,p[1])}),m));
 ps.push(mkP(s.map(function(p){return T(p[0],.5,p[1])}).reverse(),m));
 for(var k=0;k<n;k++){var a=s[k],b=s[(k+1)%n];ps.push(mkP([T(a[0],-.5,a[1]),T(a[0],.5,a[1]),T(b[0],.5,b[1]),T(b[0],-.5,b[1])],m))}
 return ps}
function hex2(h){var n=parseInt(String(h).slice(1),16)||0;return[n>>16&255,n>>8&255,n&255]}
// ---- durum ----
var PAL=["#8a96ad","#e08a4b","#4fa3a5","#c05a7a","#7aa34f","#8c6fd1","#d4b43c","#5b8def"],CUTC="#d9604f",KEY="serbest3b_v2";
var OBJ=[],SEL=0,UNIT="cm",SNAP=0,MODE="cam",MESH=[],MS=[];
var th=.8,ph=1.05,rad=330,TG=[0,25,0],K=1,LC=null,ZB=null,OID=null,PID=null;
function mk(t,op){return{t:t,op:op,col:op=="cut"?CUTC:PAL[OBJ.length%PAL.length],ax:0,ay:-1,az:0,x:0,y:0,z:0,sx:40,sy:40,sz:40,rx:0,ry:0,rz:0}}
function demo(){OBJ=[];var A=function(t,op,c,e){OBJ.push(Object.assign(mk(t,op),{col:c},e))};
 A("box","add",PAL[0],{sx:120,sy:10,sz:90});
 A("box","add",PAL[1],{y:10,z:-39,sx:120,sy:70,sz:12});
 A("cyl","add",PAL[2],{ay:0,y:40,z:-22,rx:90,sx:40,sy:22,sz:40});
 A("cyl","cut",CUTC,{ay:0,y:40,z:-20,rx:90,sx:24,sy:50,sz:24});
 A("cyl","cut",CUTC,{x:-45,y:-5,z:28,sx:10,sy:20,sz:10});
 A("cyl","cut",CUTC,{x:45,y:-5,z:28,sx:10,sy:20,sz:10});SEL=0}
function rebuild(){var r=null;try{OBJ.forEach(function(o,i){var g=gen(o,i);if(o.op=="add")r=r?uni(r,g):g;else if(r)r=dif(r,g)})}catch(e){console.error(e)}MESH=r||[];draw()}
var pend=false;function sched(){if(pend)return;pend=true;requestAnimationFrame(function(){pend=false;rebuild()})}
var sv=function(v){return SNAP?Math.round(v/SNAP)*SNAP:Math.round(v*10)/10};
var fmt=function(v){return String(Math.round(v*10)/10)};
// ---- kayıt / geri al ----
var HIST=[],HI=-1,tmr;
function state(){return JSON.stringify({o:OBJ,u:UNIT,sn:SNAP,sel:SEL})}
function store(s){try{localStorage.setItem(KEY,s);localStorage.setItem(KEY+"c",JSON.stringify([th,ph,rad,TG]));document.getElementById("st").textContent="Kaydedildi ✓"}catch(e){document.getElementById("st").textContent="Kayıt kullanılamıyor"}}
function commit(){document.getElementById("st").textContent="…";clearTimeout(tmr);tmr=setTimeout(function(){var s=state();if(HIST[HI]!==s){HIST=HIST.slice(0,HI+1);HIST.push(s);if(HIST.length>80)HIST.shift();HI=HIST.length-1}store(s)},400)}
function load(s){var d=JSON.parse(s);OBJ=d.o;UNIT=d.u||"cm";SNAP=d.sn||0;SEL=Math.max(0,Math.min(d.sel,OBJ.length-1));document.getElementById("unit").value=UNIT;document.getElementById("snap").value=SNAP;list();rebuild()}
document.getElementById("undo").onclick=function(){if(HI>0){HI--;load(HIST[HI]);store(HIST[HI])}};
document.getElementById("redo").onclick=function(){if(HI<HIST.length-1){HI++;load(HIST[HI]);store(HIST[HI])}};
var nb=document.getElementById("new"),nt;nb.onclick=function(){if(nb.dataset.s){OBJ=[];SEL=0;MS=[];nb.textContent="Yeni çizim";delete nb.dataset.s;list();rebuild();commit()}else{nb.dataset.s=1;nb.textContent="Emin misin? Sil";clearTimeout(nt);nt=setTimeout(function(){nb.textContent="Yeni çizim";delete nb.dataset.s},3000)}};
// ---- arayüz ----
function list(){var l=document.getElementById("list");l.innerHTML="";OBJ.forEach(function(o,i){var b=document.createElement("button");b.className="it"+(i==SEL?" on":"");b.innerHTML='<i style="background:'+o.col+'"></i>'+(i+1)+(o.op=="cut"?" − ":" ")+NAMES[o.t];b.onclick=function(){SEL=i;list();draw();commit()};l.appendChild(b)});editor()}
function syncEd(ex){var o=OBJ[SEL];if(!o)return;document.querySelectorAll("#ed [data-k]").forEach(function(i){if(i!==ex&&i!==document.activeElement)i.value=o[i.dataset.k]})}
function editor(){var e=document.getElementById("ed"),o=OBJ[SEL];if(!o){e.innerHTML='<div class="hint">Parça yok. Yukarıdan ekle.</div>';return}
 var AX=[["x","ax","Konum X (sağ-sol)",["Sol kenar","Orta","Sağ kenar"]],["y","ay","Konum Y (yükseklik)",["Alt yüz","Orta","Üst yüz"]],["z","az","Konum Z (ön-arka)",["Arka kenar","Orta","Ön kenar"]]];
 var h='<h2>Seçili: '+(SEL+1)+' · '+NAMES[o.t]+'</h2><div class="r"><select id="op"><option value="add">Ekle (dolu)</option><option value="cut">Kes (delik)</option></select><input type="color" id="pc" value="'+o.col+'"><button id="dup">Kopyala</button><button id="up">↑</button><button id="dn">↓</button><button id="del">Sil</button></div>';
 AX.forEach(function(a){h+='<div class="pr"><label>'+a[2]+'</label><input type="number" inputmode="decimal" step="any" data-k="'+a[0]+'" value="'+o[a[0]]+'"><select data-a="'+a[1]+'">'+a[3].map(function(n,i){return'<option value="'+(i-1)+'"'+(o[a[1]]==i-1?" selected":"")+'>'+n+'</option>'}).join("")+'</select></div>'});
 h+='<h2>Ölçü</h2><div class="g3"><div><label>Genişlik X</label><input type="number" inputmode="decimal" step="any" data-k="sx" value="'+o.sx+'"></div><div><label>Yükseklik Y</label><input type="number" inputmode="decimal" step="any" data-k="sy" value="'+o.sy+'"></div><div><label>Derinlik Z</label><input type="number" inputmode="decimal" step="any" data-k="sz" value="'+o.sz+'"></div></div><h2>Döndürme (Döndür aracıyla fareyle de)</h2>';
 ["rx","ry","rz"].forEach(function(k){h+='<div class="rr"><label>'+k[1].toUpperCase()+'°</label><input type="range" min="-180" max="180" step="1" data-k="'+k+'" value="'+o[k]+'"><input type="number" inputmode="decimal" step="any" data-k="'+k+'" value="'+o[k]+'"><button data-q="'+k+'">+90°</button></div>'});
 e.innerHTML=h;document.getElementById("op").value=o.op;
 e.querySelectorAll("[data-k]").forEach(function(i){i.oninput=function(){var v=parseFloat(i.value);if(!isNaN(v)){o[i.dataset.k]=v;syncEd(i);sched();commit()}}});
 e.querySelectorAll("[data-q]").forEach(function(b){b.onclick=function(){var k=b.dataset.q;o[k]=((o[k]+90+180)%360)-180;syncEd();sched();commit()}});
 e.querySelectorAll("[data-a]").forEach(function(s){s.onchange=function(){var k=s.dataset.a,ax=k[1],old=o[k],nw=+s.value,vec=[0,0,0],i="xyz".indexOf(ax),sz=[o.sx,o.sy,o.sz][i];vec[i]=(nw-old)*.5*sz;var d=tf(vec,{rx:o.rx,ry:o.ry,rz:o.rz,x:0,y:0,z:0});o.x+=d[0];o.y+=d[1];o.z+=d[2];o[k]=nw;syncEd();sched();commit()}});
 document.getElementById("op").onchange=function(){o.op=this.value;if(o.op=="cut"&&o.col==PAL[0])o.col=CUTC;list();rebuild();commit()};
 document.getElementById("pc").oninput=function(){o.col=this.value;list();sched();commit()};
 document.getElementById("dup").onclick=function(){var c=Object.assign({},o);c.x+=10;c.z+=10;OBJ.splice(SEL+1,0,c);SEL++;list();rebuild();commit()};
 document.getElementById("del").onclick=function(){OBJ.splice(SEL,1);SEL=Math.max(0,Math.min(SEL,OBJ.length-1));list();rebuild();commit()};
 document.getElementById("up").onclick=function(){if(SEL>0){OBJ.splice(SEL-1,0,OBJ.splice(SEL,1)[0]);SEL--;list();rebuild();commit()}};
 document.getElementById("dn").onclick=function(){if(SEL<OBJ.length-1){OBJ.splice(SEL+1,0,OBJ.splice(SEL,1)[0]);SEL++;list();rebuild();commit()}}}
function addObj(op){OBJ.push(mk(document.getElementById("type").value,op));SEL=OBJ.length-1;list();rebuild();commit()}
document.getElementById("add").onclick=function(){addObj("add")};
document.getElementById("cut").onclick=function(){addObj("cut")};
document.getElementById("snap").onchange=function(){SNAP=+this.value;commit()};
document.getElementById("unit").onchange=function(){UNIT=this.value;draw();commit()};
document.getElementById("wf").onchange=draw;document.getElementById("dm").onchange=draw;
document.querySelectorAll("#tb [data-m]").forEach(function(b){b.onclick=function(){MODE=b.dataset.m;document.querySelectorAll("#tb [data-m]").forEach(function(x){x.classList.toggle("on",x===b)});document.getElementById("mclr").style.display=MODE=="meas"?"":"none";draw()}});
document.getElementById("mclr").onclick=function(){MS=[];draw()};
document.querySelectorAll("[data-v]").forEach(function(b){b.onclick=function(){var v=b.dataset.v;if(v=="iso"){th=.8;ph=1.05}else if(v=="front"){th=0;ph=Math.PI/2}else if(v=="top"){th=0;ph=.12}else{th=Math.PI/2;ph=Math.PI/2}draw();commit()}});
document.getElementById("fit").onclick=function(){var b=bb(MESH);if(!b)return;TG=[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2,(b[0][2]+b[1][2])/2];rad=Math.max(120,Math.max(b[1][0]-b[0][0],b[1][1]-b[0][1],b[1][2]-b[0][2])*2.3);draw();commit()};
function bb(ps){var lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9],any=false;ps.forEach(function(p){p.v.forEach(function(v){any=true;for(var i=0;i<3;i++){if(v[i]<lo[i])lo[i]=v[i];if(v[i]>hi[i])hi[i]=v[i]}})});return any?[lo,hi]:null}
// ---- kamera + yazılım çizici ----
var cv=document.getElementById("c"),ctx=cv.getContext("2d"),oc=document.createElement("canvas"),octx=oc.getContext("2d");
function resize(){var v=cv.parentElement,d=Math.min(devicePixelRatio||1,1.5);cv.width=oc.width=Math.max(50,v.clientWidth*d|0);cv.height=oc.height=Math.max(50,v.clientHeight*d|0);K=cv.width/Math.max(1,cv.clientWidth);draw()}
function css(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
function draw(){
 var W=cv.width,H=cv.height,FL=H*1.5;
 var eye=[TG[0]+rad*Math.sin(ph)*Math.sin(th),TG[1]+rad*Math.cos(ph),TG[2]+rad*Math.sin(ph)*Math.cos(th)];
 var f=nz(sub(TG,eye)),r=nz(cr(f,[0,1,0])),u=cr(r,f);LC={eye:eye,f:f,r:r,u:u,W:W,H:H,FL:FL};
 function P(p){var d=sub(p,eye),z=dot(d,f);return[W/2+dot(d,r)*FL/z,H/2-dot(d,u)*FL/z,z]}
 var img=octx.createImageData(W,H),px=img.data,zb=new Float32Array(W*H),oid=new Int16Array(W*H).fill(-1),pid=new Int32Array(W*H).fill(-1),L=nz([.4,.9,.5]);
 MESH.forEach(function(p,pi){var n=p.pl.n,sh=.32+.55*Math.max(0,dot(n,L))+.2*Math.max(0,-dot(n,f)),q=p.v.map(P),k,ok=true;
  q.forEach(function(a){if(a[2]<2)ok=false});if(!ok)return;
  var R=Math.min(255,p.c[0]*sh)|0,G=Math.min(255,p.c[1]*sh)|0,B=Math.min(255,p.c[2]*sh)|0;
  for(k=1;k<q.length-1;k++){var a=q[0],b=q[k],c=q[k+1],ar=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(ar)<1e-6)continue;
   var x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1]))),ia=1/a[2],ib=1/b[2],ic=1/c[2];
   for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){
    var w0=((b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x))/ar,w1=((c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x))/ar,w2=1-w0-w1;
    if(w0<-.001||w1<-.001||w2<-.001)continue;var iz=w0*ia+w1*ib+w2*ic,id=y*W+x;
    if(iz>zb[id]){zb[id]=iz;oid[id]=p.o;pid[id]=pi;var o=id*4;px[o]=R;px[o+1]=G;px[o+2]=B;px[o+3]=255}}}});
 // kenar çizgileri
 function edge(i,j){if(oid[i]<0&&oid[j]<0)return;var e=oid[i]!=oid[j];
  if(!e){var a=MESH[pid[i]].pl.n,b=MESH[pid[j]].pl.n;e=dot(a,b)<.9||Math.abs(zb[i]-zb[j])>.03*Math.max(zb[i],zb[j])}
  if(e){var t=zb[i]>=zb[j]?i:j,o=t*4;px[o]*=.45;px[o+1]*=.45;px[o+2]*=.45;px[o+3]=255}}
 for(var yy=0;yy<H-1;yy++)for(var xx=0;xx<W-1;xx++){var i=yy*W+xx;edge(i,i+1);edge(i,i+W)}
 ZB=zb;OID=oid;
 octx.putImageData(img,0,0);ctx.clearRect(0,0,W,H);
 var cL=css("--line"),cM=css("--muted"),cP=css("--panel"),cT=css("--text");
 function ln(a,b,c,lw){var p=P(a),q=P(b);if(p[2]<2||q[2]<2)return;ctx.strokeStyle=c;ctx.lineWidth=lw*K;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke()}
 function tx(t,p,c){var q=P(p);if(q[2]<2)return;ctx.font="bold "+(12*K)+"px system-ui,sans-serif";var w=ctx.measureText(t).width;ctx.fillStyle=cP;ctx.globalAlpha=.85;ctx.fillRect(q[0]-w/2-3*K,q[1]-8*K,w+6*K,16*K);ctx.globalAlpha=1;ctx.fillStyle=c;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(t,q[0],q[1])}
 for(var g=-200;g<=200;g+=20){ln([g,0,-200],[g,0,200],cL,1);ln([-200,0,g],[200,0,g],cL,1)}
 // cetvel (eksen sayıları)
 var stp=rad<220?10:rad<480?20:50;
 for(var v=-200;v<=200;v+=stp){if(!v)continue;ln([v,0,0],[v,0,4],"#e5484d",1);tx(fmt(v),[v,0,10],"#e5484d");ln([0,0,v],[4,0,v],"#3e63dd",1);tx(fmt(v),[10,0,v],"#3e63dd");if(v>0&&v<=160){ln([0,v,0],[4,v,0],"#30a46c",1);tx(fmt(v),[10,v,0],"#30a46c")}}
 ctx.drawImage(oc,0,0);
 ln([0,0,0],[80,0,0],"#e5484d",3);ln([0,0,0],[0,80,0],"#30a46c",3);ln([0,0,0],[0,0,80],"#3e63dd",3);
 tx("X",[88,0,0],"#e5484d");tx("Y",[0,88,0],"#30a46c");tx("Z",[0,0,88],"#3e63dd");
 var o=OBJ[SEL],info="";
 if(o){var gp=gen(o,SEL),b=bb(gp);
  if(document.getElementById("wf").checked){var c=o.op=="cut"?"#ff453a":"#ffc400";gp.forEach(function(p){for(var i=0;i<p.v.length;i++)ln(p.v[i],p.v[(i+1)%p.v.length],c,1.6)})}
  if(b&&document.getElementById("dm").checked){var lo=b[0],hi=b[1],cc="#19b5c9",U=" "+UNIT;
   ln([lo[0],lo[1],hi[2]],[hi[0],lo[1],hi[2]],cc,2.5);tx(fmt(hi[0]-lo[0])+U,[(lo[0]+hi[0])/2,lo[1],hi[2]],cc);
   ln([hi[0],lo[1],hi[2]],[hi[0],hi[1],hi[2]],cc,2.5);tx(fmt(hi[1]-lo[1])+U,[hi[0],(lo[1]+hi[1])/2,hi[2]],cc);
   ln([hi[0],lo[1],lo[2]],[hi[0],lo[1],hi[2]],cc,2.5);tx(fmt(hi[2]-lo[2])+U,[hi[0],lo[1],(lo[2]+hi[2])/2],cc)}
  if(b)info="Parça "+(SEL+1)+" · X "+fmt(b[0][0])+"→"+fmt(b[1][0])+" · Y "+fmt(b[0][1])+"→"+fmt(b[1][1])+" · Z "+fmt(b[0][2])+"→"+fmt(b[1][2])+" ("+UNIT+")"}
 var all=bb(MESH);if(all)info+=(info?"<br>":"")+"Toplam: "+fmt(all[1][0]-all[0][0])+" × "+fmt(all[1][1]-all[0][1])+" × "+fmt(all[1][2]-all[0][2])+" "+UNIT;
 MS.forEach(function(p,i){var q=P(p);ctx.fillStyle="#ff2d95";ctx.beginPath();ctx.arc(q[0],q[1],5*K,0,7);ctx.fill()});
 if(MS.length==2){ln(MS[0],MS[1],"#ff2d95",2.5);var d=sub(MS[1],MS[0]);tx(fmt(Math.hypot(d[0],d[1],d[2]))+" "+UNIT,[(MS[0][0]+MS[1][0])/2,(MS[0][1]+MS[1][1])/2,(MS[0][2]+MS[1][2])/2],"#ff2d95");
  info="Cetvel: mesafe "+fmt(Math.hypot(d[0],d[1],d[2]))+" · ΔX "+fmt(Math.abs(d[0]))+" · ΔY "+fmt(Math.abs(d[1]))+" · ΔZ "+fmt(Math.abs(d[2]))+" "+UNIT}
 else if(MODE=="meas")info="Cetvel: "+(MS.length?"ikinci":"birinci")+" noktaya dokun (köşelere yapışır)"+(info?"<br>"+info:"");
 var hint={cam:"",rot:"Döndür: sürükle (sağ-sol: Y, yukarı-aşağı: X)",move:"Taşı: sürükle (zemin üzerinde)",movey:"Yükseklik: yukarı-aşağı sürükle",meas:""}[MODE];
 document.getElementById("info").innerHTML=(hint?hint+"<br>":"")+info}
function unproj(cx,cy){var c=LC,id=Math.round(cy)*c.W+Math.round(cx),best=null,bd=22*K*22*K;
 MESH.forEach(function(p){p.v.forEach(function(v){var d=sub(v,c.eye),z=dot(d,c.f);if(z<2)return;var sx=c.W/2+dot(d,c.r)*c.FL/z,sy=c.H/2-dot(d,c.u)*c.FL/z,dd=(sx-cx)*(sx-cx)+(sy-cy)*(sy-cy);
  if(dd<bd){var ix=Math.round(sx),iy=Math.round(sy);if(ix>=0&&iy>=0&&ix<c.W&&iy<c.H&&1/z>=ZB[iy*c.W+ix]*.97){bd=dd;best=v}}})});
 if(best)return best.slice();
 var z=ZB[id]?1/ZB[id]:0,ux=(cx-c.W/2)/c.FL,uy=-(cy-c.H/2)/c.FL,dir=[c.f[0]+c.r[0]*ux+c.u[0]*uy,c.f[1]+c.r[1]*ux+c.u[1]*uy,c.f[2]+c.r[2]*ux+c.u[2]*uy];
 if(z)return[c.eye[0]+dir[0]*z,c.eye[1]+dir[1]*z,c.eye[2]+dir[2]*z];
 if(dir[1]<-1e-4){var t=-c.eye[1]/dir[1];return[c.eye[0]+dir[0]*t,0,c.eye[2]+dir[2]*t]}return null}
// ---- fare / dokunma ----
var pts={},pd=0,drag=null;
cv.addEventListener("pointerdown",function(e){cv.setPointerCapture(e.pointerId);pts[e.pointerId]=[e.clientX,e.clientY];
 if(Object.keys(pts).length==1){var o=OBJ[SEL];drag={sx:e.clientX,sy:e.clientY,px:e.clientX,py:e.clientY,moved:false,s:o?{x:o.x,y:o.y,z:o.z,rx:o.rx,ry:o.ry}:null}}else drag=null});
cv.addEventListener("pointermove",function(e){var q=pts[e.pointerId];if(!q)return;var ids=Object.keys(pts);
 if(ids.length==2){pts[e.pointerId]=[e.clientX,e.clientY];var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pd)rad=Math.max(60,Math.min(1200,rad*pd/d));pd=d;draw();return}
 if(!drag)return;var dx=e.clientX-drag.px,dy=e.clientY-drag.py,tx=e.clientX-drag.sx,ty=e.clientY-drag.sy;
 if(Math.hypot(tx,ty)>6)drag.moved=true;drag.px=e.clientX;drag.py=e.clientY;pts[e.pointerId]=[e.clientX,e.clientY];if(!drag.moved)return;
 var o=OBJ[SEL];
 if(MODE=="cam"||MODE=="meas||"||MODE=="meas"||!o){th-=dx*.01;ph=Math.max(.12,Math.min(Math.PI-.12,ph-dy*.01));draw();return}
 var s=rad/LC.FL*K,rs=SNAP>=5?5:1;
 if(MODE=="rot"){o.ry=Math.round((drag.s.ry+tx*.5)/rs)*rs;o.rx=Math.round((drag.s.rx+ty*.5)/rs)*rs;o.ry=((o.ry+540)%360)-180;o.rx=((o.rx+540)%360)-180}
 else if(MODE=="move"){var f=LC.f,u=LC.u,fl=Math.hypot(f[0],f[2])>.3?nz([f[0],0,f[2]]):nz([u[0],0,u[2]]),rr=nz([LC.r[0],0,LC.r[2]]);
  o.x=sv(drag.s.x+(rr[0]*tx-fl[0]*ty)*s);o.z=sv(drag.s.z+(rr[2]*tx-fl[2]*ty)*s)}
 else if(MODE=="movey"){o.y=sv(drag.s.y-ty*s)}
 syncEd();sched()});
function up(e){var d=drag;delete pts[e.pointerId];pd=0;drag=null;if(!d)return;
 if(!d.moved){var r=cv.getBoundingClientRect(),cx=(e.clientX-r.left)*K,cy=(e.clientY-r.top)*K;
  if(MODE=="meas"){var p=unproj(cx,cy);if(p){if(MS.length>=2)MS=[];MS.push(p);draw()}}
  else{var id=Math.round(cy)*cv.width+Math.round(cx),oi=OID?OID[id]:-1;if(oi>=0){SEL=oi;list();draw();commit()}}}
 else commit()}
cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",function(e){delete pts[e.pointerId];drag=null;pd=0});
cv.addEventListener("wheel",function(e){e.preventDefault();rad=Math.max(60,Math.min(1200,rad*(1+e.deltaY*.001)));draw();commit()},{passive:false});
addEventListener("resize",resize);
// ---- başlat ----
(function(){var s=null;try{s=localStorage.getItem(KEY);var c=JSON.parse(localStorage.getItem(KEY+"c")||"null");if(c){th=c[0];ph=c[1];rad=c[2];TG=c[3]}}catch(e){}
 if(s){try{var d=JSON.parse(s);OBJ=d.o.map(function(o){return Object.assign(mk(o.t,o.op),o)});UNIT=d.u||"cm";SNAP=d.sn||0;SEL=Math.max(0,Math.min(d.sel||0,OBJ.length-1))}catch(e){demo()}}else demo();
 document.getElementById("unit").value=UNIT;document.getElementById("snap").value=SNAP;
 HIST=[state()];HI=0;list();resize();rebuild();document.getElementById("st").textContent=s?"Kayıt yüklendi ✓":""})();
