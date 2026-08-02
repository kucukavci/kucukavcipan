let braceType = 'X';

// ---------- localStorage: durumu kaydet / geri yükle ----------
const KAPI_STORAGE_KEY = 'panel_kapiDestek_state_v1';
function saveKapiState(){
  try{
    const state = {
      braceType,
      doorH: document.getElementById('doorH').value,
      doorW: document.getElementById('doorW').value,
      frameW: document.getElementById('frameW').value,
      battenT: document.getElementById('battenT').value,
      battenB: document.getElementById('battenB').value,
    };
    localStorage.setItem(KAPI_STORAGE_KEY, JSON.stringify(state));
  }catch(e){ /* localStorage kullanılamıyorsa sessizce geç */ }
}
function loadKapiState(){
  try{
    const raw = localStorage.getItem(KAPI_STORAGE_KEY);
    if(!raw) return false;
    const state = JSON.parse(raw);
    if(state.doorH !== undefined) document.getElementById('doorH').value = state.doorH;
    if(state.doorW !== undefined) document.getElementById('doorW').value = state.doorW;
    if(state.frameW !== undefined) document.getElementById('frameW').value = state.frameW;
    if(state.battenT !== undefined) document.getElementById('battenT').value = state.battenT;
    if(state.battenB !== undefined) document.getElementById('battenB').value = state.battenB;
    if(state.braceType){
      braceType = state.braceType;
      document.getElementById('btnX').classList.toggle('active', braceType==='X');
      document.getElementById('btnZ').classList.toggle('active', braceType==='Z');
    }
    return true;
  }catch(e){ return false; }
}

function setBrace(t){
  braceType = t;
  document.getElementById('btnX').classList.toggle('active', t==='X');
  document.getElementById('btnZ').classList.toggle('active', t==='Z');
  calc();
}

function fmt(n, d=1){ return n.toLocaleString('tr-TR', {minimumFractionDigits:d, maximumFractionDigits:d}); }

function calc(){
  const H = parseFloat(document.getElementById('doorH').value) || 0;
  const W = parseFloat(document.getElementById('doorW').value) || 0;
  const fw = parseFloat(document.getElementById('frameW').value) || 0;
  const t = parseFloat(document.getElementById('battenT').value) || 0;
  const b = parseFloat(document.getElementById('battenB').value) || t;

  if(W<=0 || H<=0){ document.getElementById('results').innerHTML = '<div class="tag"><div class="k">Uyarı</div><div class="v" style="font-size:14px">Yükseklik ve genişlik girin</div></div>'; return; }

  // Yan (dikme) parçalar tam yükseklik boyunca gider -> yükseklikten 2x derinlik düşülür.
  // Üst/alt (kiriş) parçalar dikmelerin arasına oturur -> girilen genişlik zaten o kirişin
  // kendi uzunluğudur, yani doğrudan iç boşluk genişliğidir; ekstra düşme yapılmaz.
  const innerW = W;
  const innerH = H - 2*fw;

  if(innerW<=0 || innerH<=0){
    document.getElementById('results').innerHTML = '<div class="tag"><div class="k">Uyarı</div><div class="v" style="font-size:13px">Çerçeve derinliği, iç boşluğu sıfırlıyor. Ölçüleri kontrol edin.</div></div>';
    return;
  }

  const D = Math.hypot(innerW, innerH);
  const thetaRad = Math.atan2(innerH, innerW);
  const theta = thetaRad * 180/Math.PI;
  const comp = 90 - theta;

  const halfB = b/2;
  const adj = halfB * (Math.tan(thetaRad) + 1/Math.tan(thetaRad));
  const practicalLen = D - adj;

  let resultsHtml = `
    <div class="tag">
      <div class="k">İç Boşluk (destek buraya oturur)</div>
      <div class="v">${fmt(innerW)} × ${fmt(innerH)} <span>cm</span></div>
    </div>
    <div class="tag">
      <div class="k">Merkez Hattı Uzunluğu</div>
      <div class="v">${fmt(D)} <span>cm</span></div>
    </div>
    <div class="tag chalk">
      <div class="k">Köşe Kesim Açısı (gönyeden)</div>
      <div class="v">${fmt(theta)}° <span>/ tamamlayıcı ${fmt(comp)}°</span></div>
    </div>
    <div class="tag chalk">
      <div class="k">Kesilecek Destek Uzunluğu</div>
      <div class="v">${fmt(practicalLen)} <span>cm (kenar boyu, iki uç paralel)</span></div>
    </div>
  `;

  if(braceType === 'X'){
    const crossAngle = Math.min(2*theta, 180-2*theta);
    const notchLen = b / Math.sin(crossAngle*Math.PI/180);
    const notchDepth = t/2;
    resultsHtml += `
      <div class="tag">
        <div class="k">Merkez Kesişim Açısı</div>
        <div class="v">${fmt(crossAngle)}°</div>
      </div>
      <div class="tag">
        <div class="k">Orta Geçme (Yarım Lama) Uzunluğu</div>
        <div class="v">${fmt(notchLen)} <span>cm, her parçada</span></div>
      </div>
      <div class="tag">
        <div class="k">Orta Geçme Derinliği</div>
        <div class="v">${fmt(notchDepth)} <span>cm, her parçadan</span></div>
      </div>
      <div class="tag">
        <div class="k">Geçme Merkezi Konumu</div>
        <div class="v">${fmt(D/2)} <span>cm, her uçtan</span></div>
      </div>
    `;
    document.getElementById('modeNote').innerHTML = '<b>X destek:</b> aynı ölçüde 2 çıta kesilir — her biri ' + fmt(practicalLen) + ' cm, uçları ' + fmt(theta) + '° açıyla (iki uç birbirine paralel) kesilir. Tam ortada kesiştikleri noktada her çıtadan derinliğin yarısı (' + fmt(t/2) + ' cm) alınarak yarım lama ile geçirilir, düz otururlar.';
  } else {
    document.getElementById('modeNote').innerHTML = '<b>Z destek:</b> tek çıta, köşeden köşeye. Uzunluğu ' + fmt(practicalLen) + ' cm, uçları ' + fmt(theta) + '° açıyla, iki uç birbirine paralel olacak şekilde kesilir. Ortada geçme yoktur.';
  }

  document.getElementById('results').innerHTML = resultsHtml;
  const outerWForDrawing = innerW + 2*fw; // görselde dikmelerin dışa taştığı gerçek toplam genişlik
  drawSVG(outerWForDrawing,H,fw,b,thetaRad,braceType);
  saveKapiState();
}

loadKapiState();

function braceQuad(near, far, halfB){
  const dx=far.x-near.x, dy=far.y-near.y;
  const D=Math.hypot(dx,dy);
  const ux=dx/D, uy=dy/D;
  const nx=-uy, ny=ux;
  const tanT = Math.abs(dy/dx), cotT = 1/tanT;
  const l1s = halfB*tanT, l1e = D-halfB*cotT;
  const l2s = halfB*cotT, l2e = D-halfB*tanT;
  function pt(l, sign){ return { x: near.x + sign*nx*halfB + l*ux, y: near.y + sign*ny*halfB + l*uy }; }
  return [pt(l1s,1), pt(l1e,1), pt(l2e,-1), pt(l2s,-1)];
}

let _uid = 0;
function drawSVG(W,H,reduce,b,thetaRad,type){
  const svg = document.getElementById('svgOut');
  const maxW = 400, maxH = 380;
  const scale = Math.min(maxW/W, maxH/H);
  const w = W*scale, h = H*scale;
  const ox = 96 + (maxW-w)/2, oy = 46 + (maxH-h)/2;
  const rf = reduce*scale;
  _uid++;

  function T(x,y){ return { x: ox + x*scale, y: oy + (H - y)*scale }; }
  function RS(x,y,rw,rh){ const tl = T(x, y+rh); return {x:tl.x, y:tl.y, w:rw*scale, h:rh*scale}; }

  let defs = `
    <defs>
      <linearGradient id="frameGrad${_uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e0b378"/>
        <stop offset="50%" stop-color="#b9803f"/>
        <stop offset="100%" stop-color="#845428"/>
      </linearGradient>
      <linearGradient id="brace1Grad${_uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#a85a35"/>
        <stop offset="55%" stop-color="#7e341f"/>
        <stop offset="100%" stop-color="#571f11"/>
      </linearGradient>
      <linearGradient id="brace2Grad${_uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#8f4a2c"/>
        <stop offset="55%" stop-color="#6b2c19"/>
        <stop offset="100%" stop-color="#48190e"/>
      </linearGradient>
      <radialGradient id="shadowGrad${_uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft${_uid}" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#20120a" flood-opacity="0.4"/>
      </filter>
      <filter id="blur6${_uid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6"/>
      </filter>
    </defs>
  `;

  let els = [];
  const oBL = T(0,0), oTR = T(W,H);

  // ambient ground shadow
  els.push(`<ellipse cx="${(oBL.x+oTR.x)/2}" cy="${oBL.y+10}" rx="${w*0.55}" ry="14" fill="url(#shadowGrad${_uid})"/>`);

  // wavy wood-grain generator, clipped to a shape
  function grainLines(clipId, startPt, endPt, halfWidth, count){
    const dx=endPt.x-startPt.x, dy=endPt.y-startPt.y;
    const L=Math.hypot(dx,dy); const ux=dx/L, uy=dy/L, nx=-uy, ny=ux;
    let out = `<g clip-path="url(#${clipId})">`;
    for(let i=0;i<count;i++){
      const f = -0.8 + (1.6*i/(count-1));
      const off = f*halfWidth;
      const inset = L*0.04;
      const s = {x:startPt.x+off*nx+inset*ux, y:startPt.y+off*ny+inset*uy};
      const e = {x:endPt.x+off*nx-inset*ux, y:endPt.y+off*ny-inset*uy};
      const wave = (i%2===0?1:-1)*halfWidth*0.15;
      const mid = {x:(s.x+e.x)/2+wave*nx, y:(s.y+e.y)/2+wave*ny};
      const op = 0.10 + (i%3)*0.05;
      out += `<path d="M ${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}" fill="none" stroke="#2b160c" stroke-opacity="${op.toFixed(2)}" stroke-width="1"/>`;
    }
    out += `</g>`;
    return out;
  }

  function screw(cx,cy,r){
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#5a5a58" stroke="#2c2c2b" stroke-width="1"/>
            <circle cx="${cx}" cy="${cy}" r="${r*0.55}" fill="#77756f"/>
            <line x1="${cx-r*0.6}" y1="${cy-r*0.15}" x2="${cx+r*0.6}" y2="${cy-r*0.15}" stroke="#2c2c2b" stroke-width="${Math.max(0.8,r*0.18)}"/>`;
  }

  // ---- FRAME (kiriş bantları) ----
  if(rf > 0.5){
    const leftR = RS(0, 0, reduce, H);
    const rightR = RS(W-reduce, 0, reduce, H);
    const topR = RS(reduce, H-reduce, W-2*reduce, reduce);
    const botR = RS(reduce, 0, W-2*reduce, reduce);
    let bi=0;
    [topR,botR,leftR,rightR].forEach(r=>{
      bi++;
      const cid = `fclip${_uid}_${bi}`;
      els.push(`<clipPath id="${cid}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`);
      els.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#frameGrad${_uid})" stroke="#3a2410" stroke-width="1.5" filter="url(#soft${_uid})"/>`);
      const horizontal = r.w >= r.h;
      const p1 = horizontal ? {x:r.x, y:r.y+r.h/2} : {x:r.x+r.w/2, y:r.y};
      const p2 = horizontal ? {x:r.x+r.w, y:r.y+r.h/2} : {x:r.x+r.w/2, y:r.y+r.h};
      els.push(grainLines(cid, p1, p2, Math.min(r.w,r.h)/2, 4));
    });
    // corner screws
    const corners = [T(0,0),T(W,0),T(0,H),T(W,H)];
    corners.forEach(c=> els.push(screw(c.x + (c.x<oBL.x+w/2? rf*0.5:-rf*0.5), c.y + (c.y<oBL.y? rf*0.5:-rf*0.5), Math.max(3,rf*0.16))));
    const iBL = T(reduce,reduce), iTR = T(W-reduce,H-reduce);
    els.push(`<rect x="${iBL.x}" y="${iTR.y}" width="${iTR.x-iBL.x}" height="${iBL.y-iTR.y}" fill="none" stroke="#3a2410" stroke-opacity="0.55" stroke-width="1.5"/>`);
  } else {
    els.push(`<rect x="${oBL.x}" y="${oTR.y}" width="${w}" height="${h}" rx="3" fill="#f6f1e7" stroke="#3a2410" stroke-width="2.5"/>`);
  }

  const A = {x:reduce, y:reduce}, B = {x:W-reduce, y:reduce}, C = {x:W-reduce, y:H-reduce}, Dc = {x:reduce, y:H-reduce};

  function drawBrace(nearReal, farReal, gradId, clipTag){
    const quad = braceQuad(nearReal, farReal, b/2);
    const screenPts = quad.map(p => T(p.x,p.y));
    const pts = screenPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const cid = `bclip${_uid}_${clipTag}`;
    els.push(`<clipPath id="${cid}"><polygon points="${pts}"/></clipPath>`);
    els.push(`<polygon points="${pts}" fill="url(#${gradId})" stroke="#2e150c" stroke-width="1.5" filter="url(#soft${_uid})"/>`);
    const nS = T(nearReal.x,nearReal.y), fS = T(farReal.x,farReal.y);
    els.push(grainLines(cid, nS, fS, (b/2)*scale, 5));
    // bevel highlight along one long edge
    els.push(`<line x1="${screenPts[0].x}" y1="${screenPts[0].y}" x2="${screenPts[1].x}" y2="${screenPts[1].y}" stroke="#fff2df" stroke-opacity="0.28" stroke-width="1.2"/>`);
    els.push(`<line x1="${screenPts[2].x}" y1="${screenPts[2].y}" x2="${screenPts[3].x}" y2="${screenPts[3].y}" stroke="#000000" stroke-opacity="0.28" stroke-width="1.2"/>`);
    return {mid:{x:(nS.x+fS.x)/2,y:(nS.y+fS.y)/2}, screenAngle: Math.atan2(fS.y-nS.y, fS.x-nS.x)*180/Math.PI};
  }

  const theta = thetaRad*180/Math.PI;
  const aCorner = T(A.x,A.y);

  if(type === 'X'){
    const info1 = drawBrace(A,C,`brace1Grad${_uid}`,'1');
    const info2 = drawBrace(B,Dc,`brace2Grad${_uid}`,'2');
    const mid = T((A.x+C.x)/2, (A.y+C.y)/2);
    els.push(`<circle cx="${mid.x}" cy="${mid.y}" r="12" fill="#f6f1e7" stroke="#2e150c" stroke-width="1.5"/>`);
    els.push(screw(mid.x, mid.y, 5));
    // end screws
    [A,C,B,Dc].forEach(p=>{ const s=T(p.x,p.y); els.push(screw(s.x,s.y,Math.max(3,(b*0.22)*scale))); });
  } else {
    const info1 = drawBrace(A,C,`brace1Grad${_uid}`,'1');
    [A,C].forEach(p=>{ const s=T(p.x,p.y); els.push(screw(s.x,s.y,Math.max(3,(b*0.22)*scale))); });
  }

  // angle indicator at bottom-left inner corner — clean arc + bisector label, drawn after braces
  const bisRad = thetaRad/2;
  const rArc = 30;
  const arcStart = {x: aCorner.x+rArc, y: aCorner.y};
  const arcEnd = {x: aCorner.x + rArc*Math.cos(thetaRad), y: aCorner.y - rArc*Math.sin(thetaRad)};
  els.push(`<path d="M ${arcStart.x} ${arcStart.y} A ${rArc} ${rArc} 0 0 0 ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="#1f4e79" stroke-width="2.5" stroke-linecap="round"/>`);
  els.push(`<line x1="${aCorner.x}" y1="${aCorner.y}" x2="${aCorner.x+rArc+6}" y2="${aCorner.y}" stroke="#1f4e79" stroke-width="1.5" stroke-dasharray="2 3" stroke-opacity="0.7"/>`);
  els.push(`<line x1="${aCorner.x}" y1="${aCorner.y}" x2="${aCorner.x + (rArc+6)*Math.cos(thetaRad)}" y2="${aCorner.y - (rArc+6)*Math.sin(thetaRad)}" stroke="#1f4e79" stroke-width="1.5" stroke-dasharray="2 3" stroke-opacity="0.7"/>`);
  const labelR = rArc + 26;
  const labelPt = {x: aCorner.x + labelR*Math.cos(bisRad), y: aCorner.y - labelR*Math.sin(bisRad)};
  const pillW=54, pillH=22;
  els.push(`<line x1="${aCorner.x + rArc*0.7*Math.cos(bisRad)}" y1="${aCorner.y - rArc*0.7*Math.sin(bisRad)}" x2="${labelPt.x}" y2="${labelPt.y}" stroke="#1f4e79" stroke-width="1" stroke-opacity="0.5"/>`);
  els.push(`<rect x="${labelPt.x-pillW/2}" y="${labelPt.y-pillH/2}" width="${pillW}" height="${pillH}" rx="11" fill="#1f4e79" stroke="#0d2e4a" stroke-width="1" filter="url(#soft${_uid})"/>`);
  els.push(`<text x="${labelPt.x}" y="${labelPt.y+4.5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="13" fill="#fff" font-weight="600">${theta.toFixed(1)}°</text>`);

  // outer dimension lines
  const dimY = oBL.y + 24;
  els.push(`<line x1="${oBL.x}" y1="${dimY}" x2="${oBL.x+w}" y2="${dimY}" stroke="#5b5148" stroke-width="1"/>`);
  els.push(`<line x1="${oBL.x}" y1="${oBL.y}" x2="${oBL.x}" y2="${dimY+4}" stroke="#5b5148" stroke-width="1"/>`);
  els.push(`<line x1="${oBL.x+w}" y1="${oBL.y}" x2="${oBL.x+w}" y2="${dimY+4}" stroke="#5b5148" stroke-width="1"/>`);
  els.push(`<text x="${oBL.x+w/2}" y="${dimY+16}" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" fill="#5b5148">${W} cm</text>`);

  const dimX = oBL.x - 24;
  els.push(`<line x1="${dimX}" y1="${oBL.y}" x2="${dimX}" y2="${oBL.y+h}" stroke="#5b5148" stroke-width="1"/>`);
  els.push(`<line x1="${oBL.x}" y1="${oBL.y}" x2="${dimX-4}" y2="${oBL.y}" stroke="#5b5148" stroke-width="1"/>`);
  els.push(`<line x1="${oBL.x}" y1="${oBL.y+h}" x2="${dimX-4}" y2="${oBL.y+h}" stroke="#5b5148" stroke-width="1"/>`);
  els.push(`<text x="${dimX-8}" y="${oBL.y+h/2}" text-anchor="end" dominant-baseline="middle" font-family="IBM Plex Mono" font-size="12" fill="#5b5148" transform="rotate(-90 ${dimX-8} ${oBL.y+h/2})">${H} cm</text>`);

  svg.innerHTML = defs + els.join('');
}

calc();
