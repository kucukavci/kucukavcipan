const R2D = 180/Math.PI, D2R = Math.PI/180;
function fmt(n,d=1){ return isFinite(n) ? n.toFixed(d) : '–'; }

/* ---------- localStorage: durumu kaydet / geri yükle ---------- */
const ACI_STORAGE_KEY = 'panel_aciOlcer_state_v1';
function saveAciState(){
  try{
    const activeBtn = document.querySelector('nav.tabs button.active');
    const state = {
      activeTab: activeBtn ? activeBtn.dataset.tab : undefined,
      pH: document.getElementById('p-h').value,
      pTop: document.getElementById('p-top').value,
      pBottom: document.getElementById('p-bottom').value,
      taper: (document.querySelector('input[name=taper]:checked')||{}).value,
      tA: document.getElementById('t-a').value,
      tB: document.getElementById('t-b').value,
      tC: document.getElementById('t-c').value,
      dA: document.getElementById('d-a').value,
      dB: document.getElementById('d-b').value,
      dC: document.getElementById('d-c').value,
      pieces: (typeof pieces !== 'undefined') ? pieces : [],
      pieceSeq: (typeof pieceSeq !== 'undefined') ? pieceSeq : 0,
    };
    localStorage.setItem(ACI_STORAGE_KEY, JSON.stringify(state));
  }catch(e){ /* localStorage kullanılamıyorsa sessizce geç */ }
}
function loadAciState(){
  try{
    const raw = localStorage.getItem(ACI_STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
const _aciSaved = loadAciState();
if(_aciSaved){
  if(_aciSaved.pH !== undefined) document.getElementById('p-h').value = _aciSaved.pH;
  if(_aciSaved.pTop !== undefined) document.getElementById('p-top').value = _aciSaved.pTop;
  if(_aciSaved.pBottom !== undefined) document.getElementById('p-bottom').value = _aciSaved.pBottom;
  if(_aciSaved.taper){
    const r = document.querySelector(`input[name=taper][value="${_aciSaved.taper}"]`);
    if(r) r.checked = true;
  }
  if(_aciSaved.tA !== undefined) document.getElementById('t-a').value = _aciSaved.tA;
  if(_aciSaved.tB !== undefined) document.getElementById('t-b').value = _aciSaved.tB;
  if(_aciSaved.tC !== undefined) document.getElementById('t-c').value = _aciSaved.tC;
  if(_aciSaved.dA !== undefined) document.getElementById('d-a').value = _aciSaved.dA;
  if(_aciSaved.dB !== undefined) document.getElementById('d-b').value = _aciSaved.dB;
  if(_aciSaved.dC !== undefined) document.getElementById('d-c').value = _aciSaved.dC;
}

/* ---------- tabs ---------- */
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    saveAciState();
  });
});
if(_aciSaved && _aciSaved.activeTab){
  const savedBtn = document.querySelector(`nav.tabs button[data-tab="${_aciSaved.activeTab}"]`);
  if(savedBtn) savedBtn.click();
}

/* ---------- shared: quarter-circle gauge (0-90deg) ---------- */
function drawGauge(svg, angle){
  const cx=100, cy=115, r=88;
  const clamped = Math.max(0, Math.min(90, angle));
  const a1 = Math.PI; // start at 180deg (left, horizontal)
  const a0 = Math.PI - clamped*D2R; // sweep from left towards up as angle grows
  const start = {x:cx + r*Math.cos(Math.PI), y:cy - r*Math.sin(Math.PI)};
  const needleEnd = {x:cx + r*Math.cos(a0), y:cy - r*Math.sin(a0)};
  const large = clamped > 90 ? 1:0;

  let ticks='';
  for(let d=0; d<=90; d+=15){
    const a = Math.PI - d*D2R;
    const x1=cx+(r-6)*Math.cos(a), y1=cy-(r-6)*Math.sin(a);
    const x2=cx+(r+4)*Math.cos(a), y2=cy-(r+4)*Math.sin(a);
    const lx=cx+(r+16)*Math.cos(a), ly=cy-(r+16)*Math.sin(a);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5b4c38" stroke-width="1.5"/>`;
    ticks += `<text x="${lx}" y="${ly+3}" font-family="JetBrains Mono" font-size="8" fill="#8a7a5f" text-anchor="middle">${d}</text>`;
  }

  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${needleEnd.x} ${needleEnd.y}`;

  svg.innerHTML = `
    <path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx} ${cy-r}" fill="none" stroke="#3c3225" stroke-width="10" stroke-linecap="round"/>
    <path d="${arcPath}" fill="none" stroke="#cf8b3f" stroke-width="10" stroke-linecap="round"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${needleEnd.x}" y2="${needleEnd.y}" stroke="#e6a752" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#e6a752"/>
    <text x="${cx}" y="${cy-24}" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="#ece3d2" text-anchor="middle">${isFinite(angle)?angle.toFixed(1)+'°':'–'}</text>
  `;
}

/* ================= TAB 1: PARÇA ================= */
const pH=document.getElementById('p-h'), pTop=document.getElementById('p-top'), pBottom=document.getElementById('p-bottom');
const pErr=document.getElementById('p-err');

function calcParca(){
  const h=parseFloat(pH.value), top=parseFloat(pTop.value), bottom=parseFloat(pBottom.value);
  const mode=document.querySelector('input[name=taper]:checked').value;
  pErr.textContent='';
  if(!(h>0) || !(top>=0) || !(bottom>=0)){
    pErr.textContent='Geçerli, pozitif ölçüler gir.';
    return;
  }
  const diff = top-bottom;
  const perSide = mode==='sym' ? diff/2 : diff;
  const angVert = Math.atan2(Math.abs(perSide), h)*R2D;
  const angHoriz = 90-angVert;
  const slant = Math.sqrt(h*h + perSide*perSide);

  document.getElementById('p-ang-vert').textContent = fmt(angVert)+'°';
  document.getElementById('p-ang-horiz').textContent = fmt(angHoriz)+'°';
  document.getElementById('p-slant').textContent = fmt(slant)+' cm';

  drawGauge(document.getElementById('p-gauge'), angVert);
  drawParcaSVG(h, top, bottom, mode, perSide, angVert);
  saveAciState();
}

function drawParcaSVG(h, top, bottom, mode, perSide, angVert){
  const svg = document.getElementById('p-drawing');
  const maxW = Math.max(top, bottom, 1);
  const availW = 520-160, availH = 360-140;
  const scale = Math.min(availW/maxW, availH/h);
  const topPx = top*scale, bottomPx = bottom*scale, hPx = h*scale;
  const cx = 260, topY = 70;
  const TL={x:cx-topPx/2, y:topY}, TR={x:cx+topPx/2, y:topY};
  let BL, BR;
  if(mode==='sym'){
    BL={x:cx-bottomPx/2, y:topY+hPx};
    BR={x:cx+bottomPx/2, y:topY+hPx};
  } else {
    BL={x:TL.x, y:topY+hPx};
    BR={x:TL.x+bottomPx, y:topY+hPx};
  }
  const bottomY = topY+hPx;

  function angleArc(corner, refDir, otherPt, r, flip){
    // refDir: 1 = straight down reference; corner->otherPt is the slanted edge
    const dx = otherPt.x-corner.x, dy = otherPt.y-corner.y;
    const theta = Math.atan2(dx,dy); // signed angle from vertical
    const p1 = {x:corner.x, y:corner.y+r};
    const p2 = {x:corner.x + r*Math.sin(theta), y:corner.y + r*Math.cos(theta)};
    const sweep = theta>=0 ? 1:0;
    return `<path d="M ${p1.x} ${p1.y} A ${r} ${r} 0 0 ${sweep} ${p2.x} ${p2.y}" fill="none" stroke="#5b8f96" stroke-width="1.6"/>
            <line x1="${corner.x}" y1="${corner.y}" x2="${corner.x}" y2="${corner.y+r+14}" stroke="#5b8f96" stroke-width="1" stroke-dasharray="3,3"/>`;
  }

  let arcs='';
  if(mode==='sym'){
    arcs += angleArc(TL,1,BL,34,1);
    arcs += angleArc(TR,1,BR,34,-1);
  } else {
    arcs += angleArc(TR,1,BR,34,-1);
  }

  const dimTopY = topY-30;
  const dimBottomY = bottomY+30;
  const dimLeftX = Math.min(TL.x,BL.x)-38;

  svg.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#6b5f4a"/>
      </marker>
    </defs>
    <polygon points="${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}" fill="#e4d8b8" stroke="#221d17" stroke-width="2"/>
    ${arcs}

    <line x1="${TL.x}" y1="${dimTopY}" x2="${TR.x}" y2="${dimTopY}" stroke="#6b5f4a" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
    <line x1="${TL.x}" y1="${topY-6}" x2="${TL.x}" y2="${dimTopY-4}" stroke="#c9bd9e" stroke-width="1"/>
    <line x1="${TR.x}" y1="${topY-6}" x2="${TR.x}" y2="${dimTopY-4}" stroke="#c9bd9e" stroke-width="1"/>
    <text x="${cx}" y="${dimTopY-8}" font-family="JetBrains Mono" font-size="13" fill="#221d17" text-anchor="middle">${top} cm</text>

    <line x1="${BL.x}" y1="${dimBottomY}" x2="${BR.x}" y2="${dimBottomY}" stroke="#6b5f4a" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
    <line x1="${BL.x}" y1="${bottomY+6}" x2="${BL.x}" y2="${dimBottomY+4}" stroke="#c9bd9e" stroke-width="1"/>
    <line x1="${BR.x}" y1="${bottomY+6}" x2="${BR.x}" y2="${dimBottomY+4}" stroke="#c9bd9e" stroke-width="1"/>
    <text x="${(BL.x+BR.x)/2}" y="${dimBottomY+20}" font-family="JetBrains Mono" font-size="13" fill="#221d17" text-anchor="middle">${bottom} cm</text>

    <line x1="${dimLeftX}" y1="${TL.y}" x2="${dimLeftX}" y2="${BL.y}" stroke="#6b5f4a" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
    <text x="${dimLeftX-8}" y="${(TL.y+BL.y)/2}" font-family="JetBrains Mono" font-size="13" fill="#221d17" text-anchor="middle" transform="rotate(-90 ${dimLeftX-8} ${(TL.y+BL.y)/2})">${h} cm</text>

    <text x="${(TR.x+BR.x)/2+16}" y="${(TR.y+BR.y)/2}" font-family="JetBrains Mono" font-size="12" fill="#5b8f96">${fmt(angVert)}°</text>
  `;
}

[pH,pTop,pBottom].forEach(el=>el.addEventListener('input',calcParca));
document.querySelectorAll('input[name=taper]').forEach(r=>r.addEventListener('change',calcParca));

/* ================= TAB 2: ÜÇGEN ================= */
const tA=document.getElementById('t-a'), tB=document.getElementById('t-b'), tC=document.getElementById('t-c'), tErr=document.getElementById('t-err');

function calcUcgen(){
  const a=parseFloat(tA.value), b=parseFloat(tB.value), c=parseFloat(tC.value);
  tErr.textContent='';
  if(!(a>0)||!(b>0)||!(c>0)){ tErr.textContent='Geçerli, pozitif kenarlar gir.'; return; }
  if(a+b<=c || a+c<=b || b+c<=a){ tErr.textContent='Bu üç kenarla üçgen oluşmaz.'; return; }

  const A = Math.acos((b*b+c*c-a*a)/(2*b*c))*R2D;
  const B = Math.acos((a*a+c*c-b*b)/(2*a*c))*R2D;
  const C = 180-A-B;

  document.getElementById('t-A').textContent=fmt(A)+'°';
  document.getElementById('t-B').textContent=fmt(B)+'°';
  document.getElementById('t-C').textContent=fmt(C)+'°';

  drawUcgenSVG(a,b,c,A,B,C);
  saveAciState();
}

function drawUcgenSVG(a,b,c,A,B,C){
  const svg = document.getElementById('t-drawing');
  // place A=(0,0), B=(c,0) [side AB length c], C via law of cosines
  const availW=520-100, availH=360-100;
  const rawCx = (b*b + c*c - a*a)/(2*c);
  const rawCy = -Math.sqrt(Math.max(0, b*b - rawCx*rawCx));
  const xs=[0,c,rawCx], ys=[0,0,rawCy];
  const w = Math.max(...xs)-Math.min(...xs) || 1;
  const hh = Math.max(...ys)-Math.min(...ys) || 1;
  const scale = Math.min(availW/w, availH/hh);
  const offX = 50 - Math.min(...xs)*scale, offY = 300 - Math.max(...ys)*scale;
  const P = (x,y)=>({x:x*scale+offX, y:y*scale+offY});
  const PA=P(0,0), PB=P(c,0), PC=P(rawCx,rawCy);

  svg.innerHTML = `
    <polygon points="${PA.x},${PA.y} ${PB.x},${PB.y} ${PC.x},${PC.y}" fill="#e4d8b8" stroke="#221d17" stroke-width="2"/>
    <text x="${PA.x-14}" y="${PA.y+16}" font-family="JetBrains Mono" font-size="13" fill="#221d17">A ${fmt(A)}°</text>
    <text x="${PB.x+6}" y="${PB.y+16}" font-family="JetBrains Mono" font-size="13" fill="#221d17">B ${fmt(B)}°</text>
    <text x="${PC.x-10}" y="${PC.y-10}" font-family="JetBrains Mono" font-size="13" fill="#221d17">C ${fmt(C)}°</text>
    <text x="${(PA.x+PB.x)/2}" y="${(PA.y+PB.y)/2+16}" font-family="JetBrains Mono" font-size="11" fill="#5b8f96" text-anchor="middle">c=${c}</text>
    <text x="${(PA.x+PC.x)/2-14}" y="${(PA.y+PC.y)/2}" font-family="JetBrains Mono" font-size="11" fill="#5b8f96" text-anchor="middle">b=${b}</text>
    <text x="${(PB.x+PC.x)/2+14}" y="${(PB.y+PC.y)/2}" font-family="JetBrains Mono" font-size="11" fill="#5b8f96" text-anchor="middle">a=${a}</text>
  `;
}
[tA,tB,tC].forEach(el=>el.addEventListener('input',calcUcgen));

/* ================= TAB 3: DİK ÜÇGEN ================= */
const dA=document.getElementById('d-a'), dB=document.getElementById('d-b'), dC=document.getElementById('d-c'), dErr=document.getElementById('d-err');

function calcDik(){
  let a=parseFloat(dA.value), b=parseFloat(dB.value), c=parseFloat(dC.value);
  dErr.textContent='';
  const has=(v)=>!isNaN(v)&&v>0;
  let missing='';
  if(has(a)&&has(b)&&!has(c)){ c=Math.sqrt(a*a+b*b); missing='c'; }
  else if(has(a)&&has(c)&&!has(b)){ if(c<=a){dErr.textContent='Hipotenüs, karşı kenardan büyük olmalı.';return;} b=Math.sqrt(c*c-a*a); missing='b'; }
  else if(has(b)&&has(c)&&!has(a)){ if(c<=b){dErr.textContent='Hipotenüs, komşu kenardan büyük olmalı.';return;} a=Math.sqrt(c*c-b*b); missing='a'; }
  else if(has(a)&&has(b)&&has(c)){ missing='—'; }
  else { dErr.textContent='En az iki kenar gir.'; return; }

  const theta = Math.atan2(a,b)*R2D;
  const comp = 90-theta;

  document.getElementById('d-theta').textContent=fmt(theta)+'°';
  document.getElementById('d-comp').textContent=fmt(comp)+'°';
  document.getElementById('d-missing').textContent = missing==='—' ? '—' : (missing.toUpperCase()+' = '+fmt(missing==='c'?c:missing==='b'?b:a)+' cm');

  drawGauge(document.getElementById('d-gauge'), theta);
  drawDikSVG(a,b,c,theta);
  saveAciState();
}

function drawDikSVG(a,b,c,theta){
  const svg = document.getElementById('d-drawing');
  const availW=520-100, availH=360-100;
  const scale = Math.min(availW/b, availH/a);
  const bPx=b*scale, aPx=a*scale;
  const O={x:80,y:300}, X={x:80+bPx,y:300}, Y={x:80,y:300-aPx};

  svg.innerHTML = `
    <polygon points="${O.x},${O.y} ${X.x},${X.y} ${Y.x},${Y.y}" fill="#e4d8b8" stroke="#221d17" stroke-width="2"/>
    <rect x="${O.x}" y="${O.y-14}" width="14" height="14" fill="none" stroke="#221d17" stroke-width="1.5"/>
    <text x="${(O.x+X.x)/2}" y="${O.y+22}" font-family="JetBrains Mono" font-size="12" fill="#5b8f96" text-anchor="middle">b=${fmt(b)}</text>
    <text x="${O.x-14}" y="${(O.y+Y.y)/2}" font-family="JetBrains Mono" font-size="12" fill="#5b8f96" text-anchor="middle" transform="rotate(-90 ${O.x-14} ${(O.y+Y.y)/2})">a=${fmt(a)}</text>
    <text x="${(X.x+Y.x)/2+10}" y="${(X.y+Y.y)/2-6}" font-family="JetBrains Mono" font-size="12" fill="#5b8f96">c=${fmt(c)}</text>
    <text x="${X.x-34}" y="${X.y-14}" font-family="JetBrains Mono" font-size="13" fill="#221d17">${fmt(theta)}°</text>
  `;
}
[dA,dB,dC].forEach(el=>el.addEventListener('input',calcDik));

/* ================= TAB 4: BİRLEŞTİRME ================= */
const PALETTE = ['#c1553f','#5b8f96','#cf8b3f','#6b7a4f','#8a5a9e','#3f7d8f','#b5622f','#4f7a9e'];
const MAX_PIECES = 10;
let pieces = [];
let matchedPairs = [];
let pieceSeq = 0;
const PX_PER_CM = 8;
const bCanvas = document.getElementById('b-canvas');
const bViewport = document.getElementById('b-viewport');
const bList = document.getElementById('b-list');
const bErr = document.getElementById('b-err');
const bModeSel = document.getElementById('b-mode');

function toggleBFields(){
  const diffMode = bModeSel.value==='diff';
  document.getElementById('b-top-wrap').style.display = diffMode ? 'none' : '';
  document.getElementById('b-bottom-wrap').style.display = diffMode ? 'none' : '';
  document.getElementById('b-tl-wrap').style.display = diffMode ? '' : 'none';
  document.getElementById('b-tr-wrap').style.display = diffMode ? '' : 'none';
  document.getElementById('b-bl-wrap').style.display = diffMode ? '' : 'none';
  document.getElementById('b-br-wrap').style.display = diffMode ? '' : 'none';
  document.getElementById('b-diff-note').style.display = diffMode ? '' : 'none';
}
bModeSel.addEventListener('change', toggleBFields);
toggleBFields();

/* unified shape model: h + four independent half-widths from the centerline
   (tl,tr = top-left/top-right; bl,br = bottom-left/bottom-right). Fully general:
   top and bottom edges can be different widths AND shifted sideways relative
   to each other (a true parallelogram/skewed trapezoid), each side its own angle. */
function localCorners(h, tl, tr, bl, br){
  const TL={x:-tl,y:0}, TR={x:tr,y:0}, BL={x:-bl,y:h}, BR={x:br,y:h};
  const cxp=(TL.x+TR.x+BL.x+BR.x)/4, cyp=(TL.y+TR.y+BL.y+BR.y)/4;
  return [TL,TR,BR,BL].map(p=>({x:(p.x-cxp)*PX_PER_CM, y:(p.y-cyp)*PX_PER_CM}));
}

function updatePiece(id, h, tl, tr, bl, br){
  const p = pieces.find(pc=>pc.id===id); if(!p) return;
  const top = tl+tr, bottom = bl+br;
  if(!(h>0) || !(top>0.01)){ bErr.textContent='Geçerli, pozitif ölçüler gir.'; return; }
  if(bottom < -0.001){ bErr.textContent='Açılar çok büyük — kenarlar birbirini kesiyor.'; return; }
  bErr.textContent='';
  p.h=h; p.tl=tl; p.tr=tr; p.bl=bl; p.br=br;
  p.local = localCorners(h, tl, tr, bl, br);
  cancelEdit();
  renderList();
  redrawCanvas();
}

function addPiece(h, tl, tr, bl, br){
  if(pieces.length>=MAX_PIECES){ bErr.textContent=`En fazla ${MAX_PIECES} parça ekleyebilirsin.`; return; }
  const top = tl+tr, bottom = bl+br;
  if(!(h>0) || !(top>0.01)){ bErr.textContent='Geçerli, pozitif ölçüler gir.'; return; }
  if(bottom < -0.001){ bErr.textContent='Açılar çok büyük — kenarlar birbirini kesiyor.'; return; }
  bErr.textContent='';
  const id = ++pieceSeq;
  const local = localCorners(h, tl, tr, bl, br);
  const col = PALETTE[(id-1)%PALETTE.length];
  const cols = 4;
  const idx = pieces.length;
  pieces.push({
    id, h, tl, tr, bl, br, local, color:col,
    x: 130 + (idx%cols)*190, y: 110 + Math.floor(idx/cols)*170,
    rot: (idx%2===0? -8 : 8), locked:false
  });
  renderList();
  redrawCanvas();
}

function pieceAngles(p){
  return { left: Math.atan2(Math.abs(p.tl-p.bl),p.h)*R2D, right: Math.atan2(Math.abs(p.tr-p.br),p.h)*R2D };
}

function renderList(){
  bList.innerHTML = pieces.map((p,i)=>{
    const ang = pieceAngles(p);
    const isEditing = p.id===editingId;
    const locked = !!p.locked;
    return `
    <div class="piece-row${isEditing?' editing':''}${locked?' locked':''}" data-id="${p.id}">
      <div class="piece-row-top">
        <span class="piece-swatch" style="background:${p.color}"></span>
        <span class="piece-name">P${i+1}</span>
        <input type="number" class="rot-input" data-id="${p.id}" value="${(Math.round(p.rot*10)/10)}" step="1" ${locked?'disabled':''} title="Açıyı elle gir">
        <div class="piece-controls">
          <button data-act="rot-10" title="-10°" ${locked?'disabled':''}>«</button>
          <button data-act="rot-1" title="-1°" ${locked?'disabled':''}>‹</button>
          <button data-act="rot1" title="+1°" ${locked?'disabled':''}>›</button>
          <button data-act="rot10" title="+10°" ${locked?'disabled':''}>»</button>
          <button data-act="lock" title="${locked?'Kilidi Aç':'Kilitle'}">${locked?'🔒':'🔓'}</button>
          <button data-act="edit" class="wide" title="Düzenle">✎ Düzenle</button>
          <button data-act="del" class="del" title="Sil">✕</button>
        </div>
      </div>
      <div class="piece-stats">
        <span class="piece-stat"><b>h</b>${fmt(p.h)}</span>
        <span class="piece-stat"><b>üst</b>${fmt(p.tl+p.tr)}</span>
        <span class="piece-stat"><b>alt</b>${fmt(p.bl+p.br)}</span>
        <span class="piece-stat"><b>sol</b>${fmt(ang.left,1)}°</span>
        <span class="piece-stat"><b>sağ</b>${fmt(ang.right,1)}°</span>
      </div>
    </div>
  `;}).join('') || '<div class="note">Henüz parça yok. Yukarıdan ölçüleri girip "Parça Ekle" ile başla.</div>';
  populateRefSelectors();
}

function populateRefSelectors(){
  const refSel = document.getElementById('ref-piece'), tgtSel = document.getElementById('ref-target');
  const curRef = refSel.value, curTgt = tgtSel.value;
  const opts = pieces.map((p,i)=>`<option value="${p.id}">P${i+1} (şu an ${p.rot.toFixed(0)}°)</option>`).join('');
  refSel.innerHTML = `<option value="0">Yatay taban (0°)</option>` + opts;
  tgtSel.innerHTML = opts || '<option value="">—</option>';
  if(pieces.some(p=>String(p.id)===curRef)) refSel.value = curRef;
  if(pieces.some(p=>String(p.id)===curTgt)) tgtSel.value = curTgt;
}

document.getElementById('ref-apply').addEventListener('click', ()=>{
  const refVal = document.getElementById('ref-piece').value;
  const tgtId = parseInt(document.getElementById('ref-target').value);
  const diff = parseFloat(document.getElementById('ref-diff').value)||0;
  const target = pieces.find(p=>p.id===tgtId);
  const info = document.getElementById('ref-info');
  if(!target){ info.style.display='none'; return; }
  const refAngle = refVal==='0' ? 0 : (pieces.find(p=>p.id===parseInt(refVal))||{rot:0}).rot;
  target.rot = refAngle + diff;
  renderList();
  redrawCanvas();
  info.style.display='';
  info.innerHTML = `Parça artık dünya açısında <b>${target.rot.toFixed(1)}°</b>. Bu kadar yatık duracaksa, gerçek parçada üstten kestiğin açı da yaklaşık <b>${Math.abs(diff).toFixed(1)}°</b> olmalı — referansa göre fark ne kadarsa kesim açısı da odur. (Konumu değişmedi, sadece döndü — gerekirse sürükleyip rayına oturt.)`;
});

bList.addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const row = e.target.closest('.piece-row'); const id = parseInt(row.dataset.id);
  const p = pieces.find(pc=>pc.id===id); if(!p) return;
  const act = btn.dataset.act;
  if(act==='del'){
    pieces = pieces.filter(pc=>pc.id!==id);
    if(editingId===id) cancelEdit();
  }
  else if(act==='lock'){ p.locked = !p.locked; }
  else if(p.locked){ /* rotation locked, ignore */ }
  else if(act==='rot-10') p.rot -= 10;
  else if(act==='rot-1') p.rot -= 1;
  else if(act==='rot1') p.rot += 1;
  else if(act==='rot10') p.rot += 10;
  else if(act==='edit') startEdit(id);
  renderList();
  redrawCanvas();
});
bList.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' && e.target.classList.contains('rot-input')) e.target.blur();
});
bList.addEventListener('change', (e)=>{
  const input = e.target.closest('.rot-input'); if(!input) return;
  const id = parseInt(input.dataset.id);
  const p = pieces.find(pc=>pc.id===id); if(!p || p.locked) return;
  const val = parseFloat(input.value);
  if(!isNaN(val)) p.rot = val;
  renderList();
  redrawCanvas();
});

let editingId = null;
function startEdit(id){
  const p = pieces.find(pc=>pc.id===id); if(!p) return;
  editingId = id;
  bModeSel.value = 'diff';
  toggleBFields();
  document.getElementById('b-h').value = p.h;
  document.getElementById('b-tl').value = Math.round(p.tl*10)/10;
  document.getElementById('b-tr').value = Math.round(p.tr*10)/10;
  document.getElementById('b-bl').value = Math.round(p.bl*10)/10;
  document.getElementById('b-br').value = Math.round(p.br*10)/10;
  document.getElementById('b-add').textContent = '✓ Güncelle';
  document.getElementById('b-cancel-edit').style.display = '';
  bErr.textContent='';
}
function cancelEdit(){
  editingId = null;
  document.getElementById('b-add').textContent = '+ Parça Ekle';
  document.getElementById('b-cancel-edit').style.display = 'none';
}
document.getElementById('b-cancel-edit').addEventListener('click', cancelEdit);

document.getElementById('b-add').addEventListener('click', ()=>{
  const h=parseFloat(document.getElementById('b-h').value);
  const mode=bModeSel.value;
  let tl=0, tr=0, bl=0, br=0;
  if(mode==='diff'){
    tl = parseFloat(document.getElementById('b-tl').value)||0;
    tr = parseFloat(document.getElementById('b-tr').value)||0;
    bl = parseFloat(document.getElementById('b-bl').value)||0;
    br = parseFloat(document.getElementById('b-br').value)||0;
  } else {
    const top=parseFloat(document.getElementById('b-top').value);
    const bottom=parseFloat(document.getElementById('b-bottom').value);
    tl = top/2; tr = top/2;
    if(mode==='sym'){ bl = bottom/2; br = bottom/2; }
    else { bl = top/2; br = bottom-top/2; }
  }
  if(editingId!==null){
    updatePiece(editingId, h, tl, tr, bl, br);
  } else {
    addPiece(h, tl, tr, bl, br);
  }
});
document.getElementById('b-clear').addEventListener('click', ()=>{ pieces=[]; cancelEdit(); renderList(); redrawCanvas(); });

function worldCorners(p){
  const rad = p.rot*D2R, cos=Math.cos(rad), sin=Math.sin(rad);
  return p.local.map(pt=>({ x:p.x+pt.x*cos-pt.y*sin, y:p.y+pt.x*sin+pt.y*cos }));
}
function edgeAngleUndirected(a,b){
  let ang = Math.atan2(b.y-a.y, b.x-a.x)*R2D;
  return ((ang%180)+180)%180;
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }

function redrawCanvas(){
  const wc = pieces.map(worldCorners);
  let polysSvg='', overlaySvg='';
  const matchedEdges = new Set();
  matchedPairs = [];
  const CUT_EDGES = [1,3]; // 0:top 1:right 2:bottom 3:left — only left/right are cut faces meant to mate

  for(let i=0;i<pieces.length;i++){
    for(let j=i+1;j<pieces.length;j++){
      for(const ei of CUT_EDGES){
        const a1=wc[i][ei], a2=wc[i][(ei+1)%4];
        const angA = edgeAngleUndirected(a1,a2);
        for(const ej of CUT_EDGES){
          const b1=wc[j][ej], b2=wc[j][(ej+1)%4];
          const angB = edgeAngleUndirected(b1,b2);
          let diff = Math.abs(angA-angB); diff = Math.min(diff,180-diff);
          const combos=[[a1,b1],[a1,b2],[a2,b1],[a2,b2]];
          let minD=Infinity, pt=null;
          combos.forEach(([x,y])=>{ const d=dist(x,y); if(d<minD){minD=d; pt={x:(x.x+y.x)/2,y:(x.y+y.y)/2};} });
          if(minD<45){
            if(diff<2.5 && minD<16){
              matchedEdges.add(i+'-'+ei); matchedEdges.add(j+'-'+ej);
              matchedPairs.push([i,j]);
              overlaySvg += `<circle cx="${pt.x}" cy="${pt.y}" r="7" fill="none" stroke="#3f8f52" stroke-width="2.5"/>
                <text x="${pt.x+10}" y="${pt.y-8}" font-family="JetBrains Mono" font-size="11" fill="#3f8f52" font-weight="700">✓ tutuyor</text>`;
            } else if(diff<15){
              overlaySvg += `<line x1="${a1.x}" y1="${a1.y}" x2="${b1.x}" y2="${b1.y}" stroke="#c17f3f" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>
                <text x="${pt.x+10}" y="${pt.y-8}" font-family="JetBrains Mono" font-size="10.5" fill="#c17f3f">Δ${diff.toFixed(1)}°</text>`;
            }
          }
        }
      }
    }
  }

  pieces.forEach((p,i)=>{
    const c = wc[i];
    const pts = c.map(pt=>`${pt.x},${pt.y}`).join(' ');
    let edgeStrokes='';
    for(let ei=0;ei<4;ei++){
      if(matchedEdges.has(i+'-'+ei)){
        const a=c[ei], b=c[(ei+1)%4];
        edgeStrokes += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3f8f52" stroke-width="3.5" stroke-linecap="round"/>`;
      }
    }
    const cx = c.reduce((s,pp)=>s+pp.x,0)/4, cy = c.reduce((s,pp)=>s+pp.y,0)/4;
    const lockBadge = p.locked ? `<text x="${cx}" y="${cy+16}" font-size="13" text-anchor="middle" style="pointer-events:none;">🔒</text>` : '';
    const strokeDash = p.locked ? ' stroke-dasharray="6,3"' : '';
    polysSvg += `
      <g class="piece-poly${p.locked?' locked':''}" data-idx="${i}">
        <title>${p.locked?'Kilitli — sürükleme/döndürme kapalı':'Sürükle: taşı · Tekerlek: döndür · Çift tıkla: düzenle'}</title>
        <polygon points="${pts}" fill="${p.color}" fill-opacity="0.35" stroke="${p.color}" stroke-width="2.5"${strokeDash}/>
        ${edgeStrokes}
        <text x="${cx}" y="${cy}" font-family="JetBrains Mono" font-size="12" font-weight="700" fill="${p.color}" text-anchor="middle" style="pointer-events:none;">P${i+1}</text>
        ${lockBadge}
      </g>`;
  });

  bViewport.innerHTML = polysSvg + overlaySvg + (pieces.length===0 ? `<text x="450" y="320" class="empty-hint" text-anchor="middle">Sol taraftan parça ekleyerek başla</text>` : '');
  attachDragHandlers();
  saveAciState();
}

/* ---- pan & zoom ---- */
let view = { scale:1, x:0, y:0 };
function applyView(){ bViewport.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.scale})`); }
function rootPoint(evt){
  const pt = bCanvas.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(bCanvas.getScreenCTM().inverse());
}
function svgPoint(evt){
  const pt = bCanvas.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(bViewport.getScreenCTM().inverse());
}
function zoomAt(rp, factor){
  const newScale = Math.min(4, Math.max(0.3, view.scale*factor));
  const worldPt = { x:(rp.x-view.x)/view.scale, y:(rp.y-view.y)/view.scale };
  view.scale = newScale;
  view.x = rp.x - worldPt.x*newScale;
  view.y = rp.y - worldPt.y*newScale;
  applyView();
}
document.getElementById('b-zoom-in').addEventListener('click', ()=>zoomAt({x:450,y:320}, 1.25));
document.getElementById('b-zoom-out').addEventListener('click', ()=>zoomAt({x:450,y:320}, 0.8));
document.getElementById('b-zoom-reset').addEventListener('click', ()=>{ view={scale:1,x:0,y:0}; applyView(); });

let panState = null;
bCanvas.addEventListener('pointerdown', (e)=>{
  if(e.target.closest('.piece-poly')) return;
  const rp = rootPoint(e);
  panState = { startX:rp.x, startY:rp.y, ox:view.x, oy:view.y };
  bCanvas.setPointerCapture(e.pointerId);
});
bCanvas.addEventListener('wheel', (e)=>{
  if(e.target.closest('.piece-poly')) return;
  e.preventDefault();
  zoomAt(rootPoint(e), e.deltaY>0 ? 0.9 : 1.1);
}, {passive:false});

/* ---- drag pieces + rotate + snap-to-fit ---- */
let dragState = null;
let lastPieceClick = { idx:null, time:0 };
let autoSnapEnabled = true;
document.getElementById('snap-toggle').addEventListener('change', (e)=>{ autoSnapEnabled = e.target.checked; });

function connectedGroup(startIdx){
  const group = new Set([startIdx]);
  let changed = true;
  while(changed){
    changed = false;
    matchedPairs.forEach(([a,b])=>{
      if(group.has(a) && !group.has(b) && !pieces[b].locked){ group.add(b); changed=true; }
      if(group.has(b) && !group.has(a) && !pieces[a].locked){ group.add(a); changed=true; }
    });
  }
  return Array.from(group);
}

function attachDragHandlers(){
  bViewport.querySelectorAll('.piece-poly').forEach(g=>{
    g.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      const idx = parseInt(g.dataset.idx);
      const now = Date.now();
      if(lastPieceClick.idx===idx && (now-lastPieceClick.time)<450){
        lastPieceClick = { idx:null, time:0 };
        startEdit(pieces[idx].id);
        renderList();
        redrawCanvas();
        document.querySelector('.piece-form').scrollIntoView({behavior:'smooth', block:'center'});
        return;
      }
      lastPieceClick = { idx, time:now };
      if(pieces[idx].locked) return;
      const sp = svgPoint(e);
      const group = autoSnapEnabled ? connectedGroup(idx) : [idx];
      const initPositions = {};
      group.forEach(i=>{ initPositions[i] = { x:pieces[i].x, y:pieces[i].y }; });
      dragState = { idx, group, initPositions, startSp: sp };
      g.setPointerCapture(e.pointerId);
    });
    g.addEventListener('wheel', (e)=>{
      e.preventDefault(); e.stopPropagation();
      const idx = parseInt(g.dataset.idx);
      if(pieces[idx].locked) return;
      const step = e.shiftKey ? 0.5 : 2;
      pieces[idx].rot += (e.deltaY>0 ? step : -step);
      renderList();
      redrawCanvas();
    }, {passive:false});
  });
}
bCanvas.addEventListener('pointermove', (e)=>{
  if(dragState){
    const sp = svgPoint(e);
    const dx = sp.x - dragState.startSp.x, dy = sp.y - dragState.startSp.y;
    dragState.group.forEach(i=>{
      pieces[i].x = dragState.initPositions[i].x + dx;
      pieces[i].y = dragState.initPositions[i].y + dy;
    });
    redrawCanvas();
  } else if(panState){
    const rp = rootPoint(e);
    view.x = panState.ox + (rp.x-panState.startX);
    view.y = panState.oy + (rp.y-panState.startY);
    applyView();
  }
});
function trySnap(idx){
  const p = pieces[idx];
  const wcAll = pieces.map(worldCorners);
  const cThis = wcAll[idx];
  const CUT_EDGES = [1,3];
  let best=null;
  for(const ei of CUT_EDGES){
    const a1=cThis[ei], a2=cThis[(ei+1)%4];
    const angA = edgeAngleUndirected(a1,a2);
    for(let j=0;j<pieces.length;j++){
      if(j===idx) continue;
      const cOther = wcAll[j];
      for(const ej of CUT_EDGES){
        const b1=cOther[ej], b2=cOther[(ej+1)%4];
        const angB = edgeAngleUndirected(b1,b2);
        let diff = Math.abs(angA-angB); diff = Math.min(diff,180-diff);
        const combos=[[a1,b1],[a1,b2],[a2,b1],[a2,b2]];
        combos.forEach(([x,y])=>{
          const d = dist(x,y);
          if(d<30 && diff<10){
            const score = d + diff*2;
            if(!best || score<best.score) best={score, ei, j, target:y, source:x, angA, angB};
          }
        });
      }
    }
  }
  if(!best) return;

  let raw = best.angB - best.angA;
  raw = ((raw+180)%360+360)%360-180;
  if(raw>90) raw-=180; else if(raw<-90) raw+=180;

  // two candidate corrections: the small one, and its 180°-flipped twin.
  // both make the edge collinear — but only one makes the pieces meet at a
  // corner and open away from each other instead of landing fully on top
  // of one another. Pick by whichever keeps this piece's body farther
  // from the other piece's body after the move.
  const otherCentroid = wcAll[best.j].reduce((s,pt)=>({x:s.x+pt.x/4,y:s.y+pt.y/4}),{x:0,y:0});
  function tryCandidate(delta){
    const testP = { ...p, rot: p.rot+delta };
    const nc = worldCorners(testP);
    const idxInEdge = (best.source===cThis[best.ei]) ? best.ei : (best.ei+1)%4;
    const moved = nc[idxInEdge];
    const dx = best.target.x-moved.x, dy = best.target.y-moved.y;
    const newCentroid = nc.reduce((s,pt)=>({x:s.x+(pt.x+dx)/4,y:s.y+(pt.y+dy)/4}),{x:0,y:0});
    return { dx, dy, rot:p.rot+delta, dist: dist(newCentroid, otherCentroid) };
  }
  const cand1 = tryCandidate(raw);
  const flipDelta = raw>0 ? raw-180 : raw+180;
  const cand2 = tryCandidate(flipDelta);
  const chosen = cand2.dist>cand1.dist ? cand2 : cand1;

  p.rot = chosen.rot;
  p.x += chosen.dx;
  p.y += chosen.dy;
}
['pointerup','pointercancel'].forEach(evt=>{
  bCanvas.addEventListener(evt, (e)=>{
    if(dragState){
      if(autoSnapEnabled && dragState.group.length===1) trySnap(dragState.idx);
      renderList(); redrawCanvas();
    }
    dragState=null; panState=null;
  });
});
bCanvas.addEventListener('pointerleave', ()=>{ dragState=null; panState=null; });

/* kayıtlı parça varsa onu yükle, yoksa örnek demo parçaları oluştur */
if(_aciSaved && Array.isArray(_aciSaved.pieces) && _aciSaved.pieces.length){
  pieces = _aciSaved.pieces;
  pieceSeq = _aciSaved.pieceSeq || pieces.reduce((m,p)=>Math.max(m,p.id||0),0);
} else {
  addPiece(10, 15, 15, 12, 12);
  addPiece(10, 15, 15, 12, 12);
  if(pieces[1]) pieces[1].rot = 172;
  addPiece(10, 40, 35, 35, 40);
}
renderList(); redrawCanvas(); applyView();

/* init */
calcParca();
calcUcgen();
calcDik();
