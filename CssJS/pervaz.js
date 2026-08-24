// ================= State =================
const canvas = document.getElementById('cnv');
const ctx = canvas.getContext('2d');
const wrap = document.getElementById('canvasWrap');

let heightCm = 8;
const REF_HEIGHT_CM = 8;
let refGapCm = 3.7;
let ALPHA_RAD = Math.atan(refGapCm/REF_HEIGHT_CM);
let ALPHA_DEG = ALPHA_RAD * 180/Math.PI;

function updateAlpha(){
  ALPHA_RAD = Math.atan(refGapCm/REF_HEIGHT_CM);
  ALPHA_DEG = ALPHA_RAD * 180/Math.PI;
}

// tiers: each { topWidth, leftHeight, rightHeight }
let tiers = [
  { topWidth: 317, leftHeight: 193.8, rightHeight: 193.8 },
  { topWidth: 165, leftHeight: 140, rightHeight: 140 }
];

let shape = null;
let view = { scale: 1, offsetX: 0, offsetY: 0 };
let baseFit = { scale: 1, cx:0, cy:0 };

let pointers = new Map();
let lastPinchDist = null;
let lastPanPoint = null;
let gestureStart = null; // {x,y,time,single:bool}
let gestureMoved = false;

// ================= Canvas sizing =================
let dpr = window.devicePixelRatio || 1;
function resizeCanvas(){
  dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  computeBaseFit();
  render();
}
window.addEventListener('resize', resizeCanvas);

// ================= Bevel info =================
function gapForHeight(h){ return Math.tan(ALPHA_RAD) * h; }
function updateBevelInfo(){
  const gap = gapForHeight(heightCm);
  document.getElementById('bevelInfo').innerHTML =
    `Dikey eğim açısı (α): <b>${ALPHA_DEG.toFixed(2)}°</b><br>` +
    `Referans: 8 cm yükseklik → ${refGapCm.toFixed(2)} cm taban boşluğu<br>` +
    `Seçilen yükseklik (${heightCm} cm) için taban boşluğu: <b>${gap.toFixed(3)} cm</b>`;
}
document.getElementById('refGap').addEventListener('input', function(){
  const v = parseFloat(this.value);
  if(!isNaN(v) && v >= 0){
    refGapCm = v;
    updateAlpha();
    updateBevelInfo();
    if(shape){ recalcAndRender(); }
  }
});
document.querySelectorAll('#heightPresetRow button').forEach(btn=>{
  btn.addEventListener('click', function(){
    document.querySelectorAll('#heightPresetRow button').forEach(b=>b.classList.remove('active'));
    this.classList.add('active');
    heightCm = parseFloat(this.dataset.h);
    document.getElementById('manualHeight').value = heightCm;
    updateBevelInfo();
  });
});
document.getElementById('manualHeight').addEventListener('input', function(){
  const v = parseFloat(this.value);
  if(!isNaN(v) && v > 0){
    heightCm = v;
    document.querySelectorAll('#heightPresetRow button').forEach(b=>b.classList.remove('active'));
    updateBevelInfo();
  }
});

// ================= Tier list UI =================
function renderTierList(){
  const listEl = document.getElementById('tierList');
  document.getElementById('tierCount').textContent = `(${tiers.length} kat)`;
  let html = '';
  tiers.forEach((t, idx)=>{
    html += `
    <div class="tier-card">
      <div class="tier-head">
        <b>Kat #${idx+1}</b>
        ${tiers.length > 1 ? `<button class="tier-del" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
      <label>Üst Genişlik (cm)</label>
      <input type="number" class="tierTop" data-idx="${idx}" value="${t.topWidth}" min="0" step="0.1" inputmode="decimal" style="margin-bottom:8px;">
      <div class="tier-row">
        <div>
          <label>Sol Yükseklik (cm)</label>
          <input type="number" class="tierLeftH" data-idx="${idx}" value="${t.leftHeight}" min="0.1" step="0.1" inputmode="decimal">
        </div>
        <div>
          <label>Sağ Yükseklik (cm)</label>
          <input type="number" class="tierRightH" data-idx="${idx}" value="${t.rightHeight}" min="0.1" step="0.1" inputmode="decimal">
        </div>
      </div>
    </div>`;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll('.tierTop').forEach(inp=>{
    inp.addEventListener('input', function(){
      const i = parseInt(this.dataset.idx);
      const v = parseFloat(this.value);
      tiers[i].topWidth = isNaN(v) ? 0 : v;
    });
  });
  listEl.querySelectorAll('.tierLeftH').forEach(inp=>{
    inp.addEventListener('input', function(){
      const i = parseInt(this.dataset.idx);
      const v = parseFloat(this.value);
      tiers[i].leftHeight = isNaN(v) ? 0.1 : v;
    });
  });
  listEl.querySelectorAll('.tierRightH').forEach(inp=>{
    inp.addEventListener('input', function(){
      const i = parseInt(this.dataset.idx);
      const v = parseFloat(this.value);
      tiers[i].rightHeight = isNaN(v) ? 0.1 : v;
    });
  });
  listEl.querySelectorAll('.tier-del').forEach(btn=>{
    btn.addEventListener('click', function(){
      const i = parseInt(this.dataset.idx);
      tiers.splice(i,1);
      renderTierList();
    });
  });
}

document.getElementById('btnAddTier').addEventListener('click', ()=>{
  const last = tiers[tiers.length-1];
  const prevTop = last ? last.topWidth : parseFloat(document.getElementById('baseWidth').value) || 100;
  tiers.push({ topWidth: prevTop, leftHeight: 50, rightHeight: 50 });
  renderTierList();
});

// ================= Geometry: build stacked shape (independent left/right chains) =================
function buildShape(){
  const B = parseFloat(document.getElementById('baseWidth').value);
  if(isNaN(B) || B<=0) return { error: 'Taban genişliği geçersiz.' };
  if(tiers.length === 0) return { error: 'En az bir kat/duvar ekleyin.' };
  for(const t of tiers){
    if(isNaN(t.leftHeight) || t.leftHeight <= 0 || isNaN(t.rightHeight) || t.rightHeight <= 0)
      return { error: 'Tüm katların sol/sağ yüksekliği pozitif olmalı.' };
    if(isNaN(t.topWidth) || t.topWidth < 0) return { error: 'Üst genişlik negatif olamaz.' };
  }

  const rightPts = [{ x: B/2, y: 0 }];
  const leftPts  = [{ x: -B/2, y: 0 }];
  let ry = 0, ly = 0;
  tiers.forEach(t=>{
    ry += t.rightHeight;
    ly += t.leftHeight;
    rightPts.push({ x: t.topWidth/2, y: ry });
    leftPts.push({ x: -t.topWidth/2, y: ly });
  });

  // Build closed polygon: bottom-left -> bottom-right -> up right chain -> top edge -> down left chain -> close
  const points = [];
  const segLabels = [];
  const segMeta = []; // describes how to edit each segment

  points.push(leftPts[0]); // bottom-left
  points.push(rightPts[0]); // bottom-right
  segLabels.push('Alt Taban');
  segMeta.push({ kind:'base' });

  for(let i=1;i<rightPts.length;i++){
    points.push(rightPts[i]);
    segLabels.push(`Sağ Kenar (Kat ${i})`);
    segMeta.push({ kind:'side', side:'right', tier:i-1 });
  }

  points.push(leftPts[leftPts.length-1]); // top-left, closes top edge
  segLabels.push('Üst Kenar');
  segMeta.push({ kind:'top', tier: tiers.length-1 });

  for(let i=leftPts.length-2; i>=1; i--){
    points.push(leftPts[i]);
    segLabels.push(`Sol Kenar (Kat ${i+1})`);
    segMeta.push({ kind:'side', side:'left', tier:i });
  }
  segLabels.push('Sol Kenar (Kat 1)');
  segMeta.push({ kind:'side', side:'left', tier:0 });
  // last implicit closing segment back to leftPts[0] already represented by wraparound

  const tierInfo = tiers.map((t,idx)=>({
    bottomW: idx===0 ? B : tiers[idx-1].topWidth,
    topW: t.topWidth, leftHeight: t.leftHeight, rightHeight: t.rightHeight
  }));

  return {
    points, segLabels, segMeta, tierInfo,
    baseWidth: B, topWidth: tiers[tiers.length-1].topWidth,
    totalRightHeight: ry, totalLeftHeight: ly
  };
}

// ================= Base fit (cm-space -> canvas px, y flipped) =================
function computeBaseFit(){
  if(!shape || !shape.points){ baseFit = {scale:1, cx:0, cy:0}; return; }
  const rect = wrap.getBoundingClientRect();
  const pad = 60;
  const xs = shape.points.map(p=>p.x), ys = shape.points.map(p=>p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX-minX, 1), h = Math.max(maxY-minY, 1);
  const availW = rect.width - pad*2, availH = rect.height - pad*2;
  const scale = Math.min(availW/w, availH/h);
  baseFit.scale = scale;
  baseFit.cx = (minX+maxX)/2;
  baseFit.cy = (minY+maxY)/2;
  baseFit.canvasCx = rect.width/2;
  baseFit.canvasCy = rect.height/2;
}

function toScreen(pt){
  const rect = wrap.getBoundingClientRect();
  const s = baseFit.scale * view.scale;
  const sx = (pt.x - baseFit.cx) * s + rect.width/2 + view.offsetX;
  const sy = -(pt.y - baseFit.cy) * s + rect.height/2 + view.offsetY;
  return { x: sx, y: sy };
}

// ================= Rendering =================
function drawGridBg(){
  const rect = wrap.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width, rect.height);
}

function render(){
  drawGridBg();
  if(!shape || !shape.points) return;
  const pts = shape.points.map(toScreen);
  const n = pts.length;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<n;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(63,182,255,0.06)';
  ctx.fill();

  ctx.strokeStyle = '#3fb6ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for(let i=0;i<n;i++){
    const a = shape.points[i], b = shape.points[(i+1)%n];
    const sa = pts[i], sb = pts[(i+1)%n];
    const midx = (sa.x+sb.x)/2, midy=(sa.y+sb.y)/2;
    const lenCm = Math.hypot(b.x-a.x, b.y-a.y);
    const lbl = shape.segLabels[i] || '';
    const label = `#${i+1} ${lbl}: ${lenCm.toFixed(1)}cm`;
    ctx.font = '600 10.5px Inter, sans-serif';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(midx-w/2, midy-10, w, 18);
    ctx.strokeStyle = '#3fb6ff';
    ctx.lineWidth=1;
    ctx.strokeRect(midx-w/2, midy-10, w, 18);
    ctx.fillStyle = '#3fb6ff';
    ctx.textAlign='center';
    ctx.fillText(label, midx, midy+4);
  }

  const angles = computeCornerAngles();
  for(let i=0;i<n;i++){
    const p = pts[i];
    ctx.beginPath();
    ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fillStyle = '#ffb84f';
    ctx.fill();
    ctx.strokeStyle = '#0f1115';
    ctx.lineWidth=2;
    ctx.stroke();

    const ang = angles[i];
    const cornerLabel = `#${i+1}  θ=${ang.theta.toFixed(1)}°`;
    ctx.font = '600 10px Inter, sans-serif';
    const dirX = p.x - (baseFit.canvasCx||0);
    const dirY = p.y - (baseFit.canvasCy||0);
    const dlen = Math.hypot(dirX,dirY) || 1;
    const lx = p.x + (dirX/dlen)*26;
    const ly = p.y + (dirY/dlen)*26;
    const w2 = ctx.measureText(cornerLabel).width + 8;
    ctx.fillStyle = '#181c26';
    ctx.fillRect(lx-w2/2, ly-9, w2, 16);
    ctx.strokeStyle='#3a3f4d';
    ctx.strokeRect(lx-w2/2, ly-9, w2, 16);
    ctx.fillStyle = '#ffb84f';
    ctx.textAlign='center';
    ctx.fillText(cornerLabel, lx, ly+4);
  }
}

// ================= Angle / Compound miter calc =================
function computeCornerAngles(){
  const pts = shape.points;
  const n = pts.length;
  let area2 = 0;
  for(let i=0;i<n;i++){
    const a = pts[i], b = pts[(i+1)%n];
    area2 += (a.x*b.y - b.x*a.y);
  }
  const ccw = area2 > 0;

  const rows = [];
  for(let i=0;i<n;i++){
    const prev = pts[(i-1+n)%n];
    const curr = pts[i];
    const next = pts[(i+1)%n];
    const v1x = prev.x-curr.x, v1y = prev.y-curr.y;
    const v2x = next.x-curr.x, v2y = next.y-curr.y;
    const dot = v1x*v2x+v1y*v2y;
    const mag1 = Math.hypot(v1x,v1y), mag2 = Math.hypot(v2x,v2y);
    let angleRad = Math.acos(Math.max(-1,Math.min(1, dot/(mag1*mag2))));
    let thetaDeg = angleRad*180/Math.PI;
    const cross = v1x*v2y - v1y*v2x;
    const isReflex = ccw ? (cross < 0) : (cross > 0);
    let interiorDeg = thetaDeg;
    if(isReflex) interiorDeg = 360 - thetaDeg;

    const thetaRad = interiorDeg*Math.PI/180;
    const betaRad = Math.atan(Math.cos(ALPHA_RAD)*Math.tan(thetaRad/2));
    const betaDeg = Math.abs(betaRad*180/Math.PI);

    rows.push({
      corner:i+1, theta: interiorDeg, miter: betaDeg, bevel: ALPHA_DEG,
      type: interiorDeg < 180 ? 'İç Köşe' : 'Dış Köşe'
    });
  }
  return rows;
}

function renderResults(){
  const rows = computeCornerAngles();
  let html = `<table>
    <thead><tr><th>Köşe</th><th>Duvar Açısı (θ)</th><th>Tip</th><th>Yatay Gönye (β)</th><th>Dikey Eğim (α)</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    html += `<tr>
      <td class="num">#${r.corner}</td>
      <td>${r.theta.toFixed(2)}°</td>
      <td>${r.type}</td>
      <td class="num">${r.miter.toFixed(2)}°</td>
      <td class="num">${r.bevel.toFixed(2)}°</td>
    </tr>`;
  });
  html += `</tbody></table>
    <p class="hint" style="margin-top:14px;">
      β (yatay gönye), testerenin döner tabla açısıdır: tan(β) = cos(α) × tan(θ/2).
      α (dikey eğim/bevel) referans taban boşluğuna göre hesaplanır ve seçilen yükseklikten bağımsızdır.
    </p>`;
  document.getElementById('resultsArea').innerHTML = html;
}

function renderSummary(){
  const g = gapForHeight(heightCm);
  let rowsHtml = `<div class="summary-row"><span>Alt Taban</span><span>${shape.baseWidth.toFixed(1)} cm</span></div>`;
  shape.tierInfo.forEach((t, idx)=>{
    rowsHtml += `<div class="summary-row"><span>Kat ${idx+1}: ${t.bottomW.toFixed(1)} → ${t.topW.toFixed(1)} cm</span><span>Sol ${t.leftHeight.toFixed(1)} / Sağ ${t.rightHeight.toFixed(1)} cm</span></div>`;
  });
  rowsHtml += `
    <div class="summary-row"><span>Toplam Yükseklik (Sol / Sağ)</span><span>${shape.totalLeftHeight.toFixed(1)} / ${shape.totalRightHeight.toFixed(1)} cm</span></div>
    <div class="summary-row"><span>Üst Kenar (Tepe)</span><span>${shape.topWidth.toFixed(1)} cm</span></div>
    <div class="summary-row"><span>Süpürgelik Yüksekliği</span><span>${heightCm} cm</span></div>
    <div class="summary-row"><span>Taban Boşluğu (bevel gap)</span><span>${g.toFixed(3)} cm</span></div>
  `;
  document.getElementById('shapeSummary').innerHTML = rowsHtml;
}

function recalcAndRender(){
  const result = buildShape();
  const chip = document.getElementById('statusChip');
  if(result.error){
    chip.textContent = result.error;
    chip.className = 'status-chip bad';
    document.getElementById('shapeSummary').innerHTML = `<div class="empty-msg">${result.error}</div>`;
    document.getElementById('resultsArea').innerHTML = '<div class="empty-msg">Şekil hesaplandığında köşe açıları burada listelenir.</div>';
    shape = null;
    render();
    return;
  }
  shape = result;
  chip.textContent = `Kapalı şekil · ${shape.points.length} köşe · ${tiers.length} kat`;
  chip.className = 'status-chip ok';
  computeBaseFit();
  render();
  renderResults();
  renderSummary();
}

document.getElementById('btnCalc').addEventListener('click', ()=>{
  view = { scale:1, offsetX:0, offsetY:0 };
  recalcAndRender();
});

// ================= Zoom / Pan (touch + mouse) + tap-to-edit =================
function dist(p1,p2){ return Math.hypot(p1.x-p2.x, p1.y-p2.y); }

wrap.addEventListener('pointerdown', (e)=>{
  wrap.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pointers.size === 1){
    lastPanPoint = {x:e.clientX, y:e.clientY};
    gestureStart = {x:e.clientX, y:e.clientY};
    gestureMoved = false;
  } else if(pointers.size === 2){
    const arr = Array.from(pointers.values());
    lastPinchDist = dist(arr[0], arr[1]);
    gestureStart = null; // multi-touch cancels tap detection
  }
});
wrap.addEventListener('pointermove', (e)=>{
  if(!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pointers.size === 1 && lastPanPoint){
    const dx = e.clientX - lastPanPoint.x;
    const dy = e.clientY - lastPanPoint.y;
    if(Math.hypot(e.clientX-(gestureStart?gestureStart.x:e.clientX), e.clientY-(gestureStart?gestureStart.y:e.clientY)) > 8){
      gestureMoved = true;
    }
    view.offsetX += dx;
    view.offsetY += dy;
    lastPanPoint = {x:e.clientX, y:e.clientY};
    render();
  } else if(pointers.size === 2){
    const arr = Array.from(pointers.values());
    const d = dist(arr[0], arr[1]);
    if(lastPinchDist){
      const factor = d / lastPinchDist;
      view.scale = Math.min(6, Math.max(0.3, view.scale * factor));
    }
    lastPinchDist = d;
    render();
  }
});
function clearPointer(e){
  const wasSingle = pointers.size === 1 && gestureStart && !gestureMoved;
  if(wasSingle){
    handleTap(gestureStart.x, gestureStart.y);
  }
  pointers.delete(e.pointerId);
  if(pointers.size < 2) lastPinchDist = null;
  if(pointers.size < 1){ lastPanPoint = null; gestureStart = null; }
}
wrap.addEventListener('pointerup', clearPointer);
wrap.addEventListener('pointercancel', ()=>{ pointers.clear(); lastPinchDist=null; lastPanPoint=null; gestureStart=null; });
wrap.addEventListener('pointerleave', ()=>{});

wrap.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.08 : 0.92;
  view.scale = Math.min(6, Math.max(0.3, view.scale * factor));
  render();
}, {passive:false});

document.getElementById('zoomIn').addEventListener('click', ()=>{ view.scale = Math.min(6, view.scale * 1.2); render(); });
document.getElementById('zoomOut').addEventListener('click', ()=>{ view.scale = Math.max(0.3, view.scale / 1.2); render(); });
document.getElementById('zoomReset').addEventListener('click', ()=>{ view = { scale:1, offsetX:0, offsetY:0 }; render(); });

// ================= Tap-to-edit segment length =================
let editingSegIndex = null;

function handleTap(clientX, clientY){
  if(!shape) return;
  const rect = wrap.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const n = shape.points.length;
  const pts = shape.points.map(toScreen);
  let bestIdx = -1, bestDist = 22; // px tolerance
  for(let i=0;i<n;i++){
    const sa = pts[i], sb = pts[(i+1)%n];
    const midx = (sa.x+sb.x)/2, midy = (sa.y+sb.y)/2;
    const d = Math.hypot(px-midx, py-midy);
    if(d < bestDist){ bestDist = d; bestIdx = i; }
  }
  if(bestIdx === -1) return;
  openEditModal(bestIdx);
}

function currentSegmentLength(idx){
  const n = shape.points.length;
  const a = shape.points[idx], b = shape.points[(idx+1)%n];
  return Math.hypot(b.x-a.x, b.y-a.y);
}

function openEditModal(idx){
  editingSegIndex = idx;
  const label = shape.segLabels[idx];
  const len = currentSegmentLength(idx);
  document.getElementById('editModalTitle').textContent = `#${idx+1} ${label}`;
  document.getElementById('editModalSub').textContent = 'Bu segmentin yeni uzunluğunu girin (cm). Şekil buna göre yeniden hesaplanacak.';
  document.getElementById('editModalInput').value = len.toFixed(1);
  document.getElementById('editModalErr').style.display = 'none';
  document.getElementById('editModal').classList.add('show');
}
function closeEditModal(){
  document.getElementById('editModal').classList.remove('show');
  editingSegIndex = null;
}
document.getElementById('editModalCancel').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', (e)=>{ if(e.target.id==='editModal'||e.target.classList.contains('modal-backdrop')) closeEditModal(); });

document.getElementById('editModalApply').addEventListener('click', ()=>{
  if(editingSegIndex === null) return;
  const errEl = document.getElementById('editModalErr');
  const newLen = parseFloat(document.getElementById('editModalInput').value);
  if(isNaN(newLen) || newLen <= 0){
    errEl.textContent = 'Geçerli pozitif bir uzunluk girin.';
    errEl.style.display = 'block';
    return;
  }
  const meta = shape.segMeta[editingSegIndex];
  const B = parseFloat(document.getElementById('baseWidth').value);

  if(meta.kind === 'base'){
    document.getElementById('baseWidth').value = newLen.toFixed(2);
  } else if(meta.kind === 'top'){
    tiers[meta.tier].topWidth = newLen;
  } else if(meta.kind === 'side'){
    const tIdx = meta.tier;
    const bottomW = tIdx === 0 ? B : tiers[tIdx-1].topWidth;
    const topW = tiers[tIdx].topWidth;
    const dx = Math.abs(topW/2 - bottomW/2);
    if(newLen <= dx){
      errEl.textContent = `Bu genişlik farkı için uzunluk en az ${dx.toFixed(2)} cm olmalı.`;
      errEl.style.display = 'block';
      return;
    }
    const newHeight = Math.sqrt(newLen*newLen - dx*dx);
    if(meta.side === 'left') tiers[tIdx].leftHeight = newHeight;
    else tiers[tIdx].rightHeight = newHeight;
  }

  renderTierList();
  closeEditModal();
  recalcAndRender();
});

// ================= Init =================
updateBevelInfo();
renderTierList();
resizeCanvas();
