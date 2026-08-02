
(function(){
  const $ = id => document.getElementById(id);
  const fmt = (n, d=1) => Number(n).toFixed(d).replace('.', ',');

  // ---------- localStorage: durumu kaydet / geri yükle ----------
  const STORAGE_KEY = 'panel_dolapOP_state_v1';
  function saveState(){
    try{
      const state = {
        wallLength: $('wallLength').value,
        leftHeight: $('leftHeight').value,
        rightHeight: $('rightHeight').value,
        thickness: $('thickness').value,
        autoCount: $('autoCount') ? $('autoCount').value : undefined,
        positions
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){ /* localStorage kullanılamıyorsa sessizce geç */ }
  }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const state = JSON.parse(raw);
      if(state.wallLength !== undefined) $('wallLength').value = state.wallLength;
      if(state.leftHeight !== undefined) $('leftHeight').value = state.leftHeight;
      if(state.rightHeight !== undefined) $('rightHeight').value = state.rightHeight;
      if(state.thickness !== undefined) $('thickness').value = state.thickness;
      if(state.autoCount !== undefined && $('autoCount')) $('autoCount').value = state.autoCount;
      if(Array.isArray(state.positions) && state.positions.length) positions = state.positions;
      return true;
    }catch(e){ return false; }
  }

  let positions = [17.5, 87.5, 157.5, 227.5, 297, 332.5]; // starting example (6 parça, 350cm duvarda eşit dağıtım örneği)

  function heightAt(x, L, HL, HR){
    return HL + (HR - HL) * (x / L);
  }

  function equalPositions(count, L, t){
    const n = Math.max(1, Math.round(count));
    if(n === 1) return [L/2];
    const usable = L - t;
    return Array.from({length:n}, (_, i) => t/2 + i * (usable/(n-1)));
  }

  function renderPosList(){
    const wrap = $('posList');
    wrap.innerHTML = '';
    positions.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'pos-row';
      row.innerHTML = `
        <span class="idx">${i+1}</span>
        <input type="number" step="0.1" value="${p}" data-idx="${i}">
        <button class="rm" data-idx="${i}" title="Sil">×</button>
      `;
      wrap.appendChild(row);
    });

    wrap.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        positions[idx] = parseFloat(e.target.value) || 0;
        calculate();
      });
    });
    wrap.querySelectorAll('.rm').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.target.dataset.idx, 10);
        positions.splice(idx, 1);
        renderPosList();
        calculate();
      });
    });
  }

  function calculate(){
    const errorBox = $('errorBox');
    const warnBox = $('warnBox');
    errorBox.classList.add('hidden'); errorBox.textContent = '';
    warnBox.classList.add('hidden'); warnBox.textContent = '';

    const L  = parseFloat($('wallLength').value);
    const HL = parseFloat($('leftHeight').value);
    const HR = parseFloat($('rightHeight').value);
    const t  = parseFloat($('thickness').value);

    const errs = [];
    if(!(L>0)) errs.push('Duvar uzunluğu 0\'dan büyük olmalı.');
    if(!(HL>0) || !(HR>0)) errs.push('Sol/sağ yükseklikler 0\'dan büyük olmalı.');
    if(!(t>0)) errs.push('Parça kalınlığı 0\'dan büyük olmalı.');
    if(positions.length===0) errs.push('En az bir parça konumu ekle.');

    if(errs.length){
      errorBox.textContent = errs.join(' ');
      errorBox.classList.remove('hidden');
      $('pieceTable').querySelector('tbody').innerHTML='';
      $('drawingContainer').innerHTML='';
      return;
    }

    const outOfRange = positions.some(p => p < 0 || p > L);
    if(outOfRange){
      warnBox.textContent = 'Bazı konumlar duvar uzunluğu (0 – ' + fmt(L,0) + ' cm) dışında.';
      warnBox.classList.remove('hidden');
    }

    const sortedIdx = positions.map((p,i)=>i).sort((a,b)=>positions[a]-positions[b]);
    const sorted = sortedIdx.map(i => positions[i]);
    for(let i=1;i<sorted.length;i++){
      if(sorted[i]-sorted[i-1] < t){
        warnBox.textContent = (warnBox.textContent ? warnBox.textContent + ' ' : '') +
          'Bazı parçalar birbirine çok yakın (kalınlıktan daha az mesafeli) — fiziksel çakışma olabilir, konumları kontrol et.';
        warnBox.classList.remove('hidden');
        break;
      }
    }

    const angleRad = Math.atan2(HL - HR, L);
    const angleDeg = angleRad * 180 / Math.PI;
    const direction = angleDeg > 0.01 ? 'sol yüksek, sağa doğru alçalıyor'
                     : angleDeg < -0.01 ? 'sağ yüksek, sola doğru alçalıyor'
                     : 'yatay (eğim yok)';

    const pieces = sorted.map((x, i) => ({
      idx: i+1, x, h: heightAt(x, L, HL, HR)
    }));

    $('angleNum').innerHTML = fmt(Math.abs(angleDeg),2) + '<span class="deg">°</span>';
    $('angleTxt').innerHTML = `Tüm ${pieces.length} parçanın üst kesimi için sabit açı.<br><b>${direction}</b>`;

    $('summaryGrid').innerHTML = `
      <div class="stat"><div class="k">Parça Sayısı</div><div class="v">${pieces.length}<span class="unit">adet</span></div></div>
      <div class="stat"><div class="k">Yükseklik Farkı</div><div class="v">${fmt(Math.abs(HL-HR))}<span class="unit">cm</span></div></div>
      <div class="stat"><div class="k">En Yüksek Parça</div><div class="v">${fmt(Math.max(...pieces.map(p=>p.h)))}<span class="unit">cm</span></div></div>
      <div class="stat"><div class="k">En Alçak Parça</div><div class="v">${fmt(Math.min(...pieces.map(p=>p.h)))}<span class="unit">cm</span></div></div>
    `;

    $('pieceTable').querySelector('tbody').innerHTML = pieces.map(p => `
      <tr>
        <td class="hl">${p.idx}</td>
        <td>${fmt(p.x)} cm</td>
        <td class="hl">${fmt(p.h)} cm</td>
      </tr>
    `).join('');

    // gaps: wall-edge -> first piece, between each consecutive pair, last piece -> wall-edge
    const gaps = [];
    const edges = [0, ...pieces.map(p=>p.x), L];
    for(let i=0;i<edges.length-1;i++){
      let start = edges[i], end = edges[i+1];
      // subtract half-thickness on each side where a piece (not the wall edge) bounds the gap
      if(i>0) start += t/2;
      if(i<edges.length-2) end -= t/2;
      const width = end - start;
      const label = i===0 ? 'Sol Duvar → 1'
                  : i===edges.length-2 ? (pieces.length) + ' → Sağ Duvar'
                  : pieces[i-1].idx + ' → ' + pieces[i].idx;
      gaps.push({label, start, end, width});
    }

    $('gapTable').querySelector('tbody').innerHTML = gaps.map(g => `
      <tr>
        <td>${g.label}</td>
        <td>${fmt(g.start)} cm</td>
        <td>${fmt(g.end)} cm</td>
        <td class="hl">${fmt(g.width)} cm</td>
      </tr>
    `).join('');

    renderDrawing({L, HL, HR, pieces, t, angleRad, gaps});
    saveState();
  }

  function renderDrawing(d){
    const {L, HL, HR, pieces, t, gaps} = d;
    const marginL = 70, marginR = 30, marginTop = 60, marginBottom = 84;
    const drawW = 980;
    const scale = (drawW - marginL - marginR) / L;
    const maxH = Math.max(HL, HR);
    const drawH = maxH * scale + marginTop + marginBottom;

    const X = x => marginL + x*scale;
    const Y = h => (drawH - marginBottom) - h*scale;
    const baseY = Y(0);

    let svg = `<svg viewBox="0 0 ${drawW} ${drawH}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Mono, monospace">`;

    // floor
    svg += `<line x1="${X(0)}" y1="${baseY}" x2="${X(L)}" y2="${baseY}" stroke="#3a5266" stroke-width="1.5"/>`;
    // slope reference
    svg += `<line x1="${X(0)}" y1="${Y(HL)}" x2="${X(L)}" y2="${Y(HR)}" stroke="#6fd3ff" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.85"/>`;
    // walls
    svg += `<line x1="${X(0)}" y1="${baseY}" x2="${X(0)}" y2="${Y(HL)}" stroke="#3a5266" stroke-width="1.5"/>`;
    svg += `<line x1="${X(L)}" y1="${baseY}" x2="${X(L)}" y2="${Y(HR)}" stroke="#3a5266" stroke-width="1.5"/>`;

    // angle arc (single, top-left)
    const arcR = 46;
    const angleRad = d.angleRad;
    const arcEndX = X(0) + arcR*Math.cos(angleRad);
    const arcEndY = Y(HL) + arcR*Math.sin(angleRad);
    svg += `<line x1="${X(0)}" y1="${Y(HL)}" x2="${X(0)+70}" y2="${Y(HL)}" stroke="#8ea6b8" stroke-width="1" stroke-dasharray="3 4"/>`;
    svg += `<path d="M ${X(0)+arcR} ${Y(HL)} A ${arcR} ${arcR} 0 0 1 ${arcEndX} ${arcEndY}" fill="none" stroke="#ff7a45" stroke-width="1.5"/>`;
    svg += `<text x="${X(0)+arcR+14}" y="${Y(HL)+18}" fill="#ff7a45" font-size="12" font-weight="600">${fmt(Math.abs(angleRad*180/Math.PI),2)}°</text>`;

    // pieces
    const pxWidth = Math.max(t*scale, 3);
    pieces.forEach((p, i) => {
      const cx = X(p.x);
      const topY = Y(p.h);
      svg += `<rect x="${cx-pxWidth/2}" y="${topY}" width="${pxWidth}" height="${baseY-topY}" fill="#c98a4b" stroke="#9c6633" stroke-width="1"/>`;
      svg += `<circle cx="${cx}" cy="${topY}" r="3.5" fill="#ff7a45"/>`;
      const offset = (i % 2 === 0) ? 12 : 26;
      svg += `<text x="${cx}" y="${topY - offset}" fill="#eaf3f8" font-size="10.5" text-anchor="middle">${fmt(p.h,1)}</text>`;
      svg += `<text x="${cx}" y="${baseY+14}" fill="#6d8496" font-size="9" text-anchor="middle">${p.idx}</text>`;
    });

    // gap dimension lines (bölme aralıkları)
    const gapY = baseY + 34;
    gaps.forEach(g => {
      const gx1 = X(g.start), gx2 = X(g.end);
      svg += `<line x1="${gx1}" y1="${gapY}" x2="${gx2}" y2="${gapY}" stroke="#ff7a45" stroke-width="1"/>`;
      svg += `<line x1="${gx1}" y1="${gapY-4}" x2="${gx1}" y2="${gapY+4}" stroke="#ff7a45" stroke-width="1"/>`;
      svg += `<line x1="${gx2}" y1="${gapY-4}" x2="${gx2}" y2="${gapY+4}" stroke="#ff7a45" stroke-width="1"/>`;
      svg += `<text x="${(gx1+gx2)/2}" y="${gapY+13}" fill="#ff7a45" font-size="9.5" text-anchor="middle">${fmt(g.width)}</text>`;
    });

    // wall length dimension
    const dimY = baseY + 62;
    svg += `<line x1="${X(0)}" y1="${dimY}" x2="${X(L)}" y2="${dimY}" stroke="#6fd3ff" stroke-width="1"/>`;
    svg += `<line x1="${X(0)}" y1="${dimY-5}" x2="${X(0)}" y2="${dimY+5}" stroke="#6fd3ff" stroke-width="1"/>`;
    svg += `<line x1="${X(L)}" y1="${dimY-5}" x2="${X(L)}" y2="${dimY+5}" stroke="#6fd3ff" stroke-width="1"/>`;
    svg += `<text x="${(X(0)+X(L))/2}" y="${dimY+16}" fill="#6fd3ff" font-size="11" text-anchor="middle">${fmt(L,0)} cm</text>`;

    // left/right height labels
    svg += `<text x="${X(0)-10}" y="${Y(HL)-6}" fill="#eaf3f8" font-size="11" text-anchor="end">${fmt(HL,1)} cm</text>`;
    svg += `<text x="${X(L)+10}" y="${Y(HR)-6}" fill="#eaf3f8" font-size="11" text-anchor="start">${fmt(HR,1)} cm</text>`;

    svg += `</svg>`;
    $('drawingContainer').innerHTML = svg;
  }

  $('autoFillBtn').addEventListener('click', () => {
    const L = parseFloat($('wallLength').value) || 350;
    const t = parseFloat($('thickness').value) || 1.8;
    const count = parseInt($('autoCount').value, 10) || 1;
    positions = equalPositions(count, L, t);
    renderPosList();
    calculate();
  });

  $('addRowBtn').addEventListener('click', () => {
    const L = parseFloat($('wallLength').value) || 350;
    const last = positions.length ? positions[positions.length-1] : 0;
    positions.push(Math.min(L, last + 30));
    renderPosList();
    calculate();
  });

  ['wallLength','leftHeight','rightHeight','thickness'].forEach(id=>{
    $(id).addEventListener('input', calculate);
  });

  loadState();
  renderPosList();
  calculate();
})();
