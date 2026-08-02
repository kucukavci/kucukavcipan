(function(){
  "use strict";

  const PALETTE = [
    "#2c5f7c","#ff6a35","#2f9e63","#8a5cf6","#e0b400",
    "#d64f7a","#1d9bb5","#c2622a","#5b7cfa","#4a9d3d",
    "#b3457a","#3a8f8f","#e07a1f","#6b5ce0","#2e8b6e"
  ];

  const tbody = document.getElementById('pieceTableBody');
  let rowCount = 0;

  // ---------- localStorage: durumu kaydet / geri yükle ----------
  const STORAGE_KEY = 'panel_profilOP_state_v1';
  function saveState(){
    try{
      const rows = Array.from(tbody.querySelectorAll('.piece-row')).map(row => ({
        name: row.querySelector('.p-name').value,
        len: row.querySelector('.p-len').value,
        qty: row.querySelector('.p-qty').value,
      }));
      const state = {
        stockLength: document.getElementById('stockLength').value,
        trimAllowance: document.getElementById('trimAllowance').value,
        kerf: document.getElementById('kerf').value,
        rows
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){ /* localStorage kullanılamıyorsa sessizce geç */ }
  }
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const state = JSON.parse(raw);
      if(state.stockLength !== undefined) document.getElementById('stockLength').value = state.stockLength;
      if(state.trimAllowance !== undefined) document.getElementById('trimAllowance').value = state.trimAllowance;
      if(state.kerf !== undefined) document.getElementById('kerf').value = state.kerf;
      if(Array.isArray(state.rows) && state.rows.length){
        tbody.innerHTML = '';
        rowCount = 0;
        state.rows.forEach(r => addRow(r.name, r.len, r.qty));
      }
      return true;
    }catch(e){ return false; }
  }

  function addRow(name, len, qty){
    rowCount++;
    const row = document.createElement('div');
    row.className = 'piece-row';
    row.dataset.id = rowCount;
    row.innerHTML = `
      <div class="col-name">
        <div class="name-cell">
          <span class="swatch" style="background:${PALETTE[(rowCount-1)%PALETTE.length]}"></span>
          <input type="text" class="p-name" placeholder="Parça ${rowCount}" value="${name||''}">
        </div>
      </div>
      <div class="col-len"><input type="number" class="p-len" min="1" step="1" value="${len||''}" placeholder="mm"></div>
      <div class="col-qty"><input type="number" class="p-qty" min="1" step="1" value="${qty||''}" placeholder="adet"></div>
      <div class="col-del"><button class="del-btn" type="button" title="Sil">✕</button></div>
    `;
    row.querySelector('.del-btn').addEventListener('click', ()=>{
      row.remove();
      saveState();
    });
    row.querySelectorAll('.p-name, .p-len, .p-qty').forEach(inp=>{
      inp.addEventListener('input', saveState);
    });
    tbody.appendChild(row);
  }

  document.getElementById('addRowBtn').addEventListener('click', ()=>{ addRow(); saveState(); });
  ['stockLength','trimAllowance','kerf'].forEach(id=>{
    document.getElementById(id).addEventListener('input', saveState);
  });

  // Önce kayıtlı bir durum var mı diye bak; yoksa örnek başlangıç satırlarını ekle
  if(!loadState()){
    addRow('Kasa Üst', 1200, 4);
    addRow('Kasa Yan', 900, 6);
  }

  function fmt(n){
    return Number(n.toFixed(2)).toLocaleString('tr-TR');
  }

  function readInputs(){
    const stockLength = parseFloat(document.getElementById('stockLength').value);
    const trim = parseFloat(document.getElementById('trimAllowance').value);
    const kerf = parseFloat(document.getElementById('kerf').value);
    const rows = Array.from(tbody.querySelectorAll('.piece-row'));
    const pieces = [];
    rows.forEach((tr,idx)=>{
      const name = tr.querySelector('.p-name').value.trim() || ('Parça ' + (idx+1));
      const len = parseFloat(tr.querySelector('.p-len').value);
      const qty = parseInt(tr.querySelector('.p-qty').value, 10);
      const color = PALETTE[idx % PALETTE.length];
      if(!isNaN(len) && !isNaN(qty) && len>0 && qty>0){
        pieces.push({name, len, qty, color, key:name+'|'+len});
      }
    });
    return {stockLength, trim, kerf, pieces};
  }

  function showError(msg){
    document.getElementById('errorBox').innerHTML = msg ? `<div class="error-box">⚠ ${msg}</div>` : '';
  }

  function optimize(stockLength, trim, kerf, pieces){
    const usable = stockLength - 2*trim;
    // genişlet: her adet için tekil item
    let items = [];
    pieces.forEach(p=>{
      for(let i=0;i<p.qty;i++){
        items.push({name:p.name, length:p.len, color:p.color, key:p.key});
      }
    });
    // en uzundan en kısaya sırala (Best-Fit Decreasing)
    items.sort((a,b)=> b.length - a.length);

    const tooLong = items.filter(it => it.length > usable);
    if(tooLong.length){
      const uniq = [...new Set(tooLong.map(t=>`${t.name} (${t.length}mm)`))];
      return {error: `Şu parça(lar) kullanılabilir profil uzunluğundan (${fmt(usable)} mm) uzun, hiçbir profile sığmaz: ${uniq.join(', ')}`};
    }

    const bars = []; // {items:[], used:0}
    items.forEach(item=>{
      let bestBar = null, bestRemaining = Infinity;
      for(const bar of bars){
        const addLen = item.length + (bar.items.length>0 ? kerf : 0);
        const remainingAfter = usable - bar.used - addLen;
        if(remainingAfter >= -1e-9 && remainingAfter < bestRemaining){
          bestRemaining = remainingAfter;
          bestBar = bar;
        }
      }
      if(bestBar){
        const addLen = item.length + (bestBar.items.length>0 ? kerf : 0);
        bestBar.items.push(item);
        bestBar.used += addLen;
      } else {
        bars.push({items:[item], used:item.length});
      }
    });

    return {bars, usable};
  }

  function render(result, ctx){
    const {stockLength, trim, kerf, pieces} = ctx;
    const {bars, usable} = result;

    const totalPieceCount = pieces.reduce((s,p)=>s+p.qty,0);
    const totalPieceLength = pieces.reduce((s,p)=>s+p.len*p.qty,0);
    const totalProfileLength = bars.length * stockLength;
    const totalFire = totalProfileLength - totalPieceLength;
    const firePct = totalProfileLength>0 ? (totalFire/totalProfileLength*100) : 0;

    // Özet kartları
    const summaryGrid = document.getElementById('summaryGrid');
    summaryGrid.innerHTML = `
      <div class="stat"><div class="label">Toplam Parça</div><div class="val">${totalPieceCount} <small>adet</small></div></div>
      <div class="stat"><div class="label">Toplam Kesim Uzunluğu</div><div class="val">${fmt(totalPieceLength)} <small>mm</small></div></div>
      <div class="stat"><div class="label">Gereken Profil</div><div class="val">${bars.length} <small>adet</small></div></div>
      <div class="stat fire"><div class="label">Toplam Fire</div><div class="val">${fmt(totalFire)} <small>mm (%${fmt(firePct)})</small></div></div>
    `;

    // Legend
    const legendBox = document.getElementById('legendBox');
    const seen = new Map();
    pieces.forEach(p=>{ if(!seen.has(p.key)) seen.set(p.key, p); });
    legendBox.innerHTML = Array.from(seen.values()).map(p=>
      `<div class="legend-item"><span class="swatch" style="background:${p.color}"></span>${p.name} — <b>${fmt(p.len)} mm</b> × ${p.qty}</div>`
    ).join('');

    // Görsel çubuklar
    const barsContainer = document.getElementById('barsContainer');
    barsContainer.innerHTML = '';
    bars.forEach((bar, i)=>{
      const remainder = usable - bar.used;
      const barFirePct = ((remainder + 2*trim) / stockLength * 100);

      const card = document.createElement('div');
      card.className = 'bar-card';

      const titleRow = document.createElement('div');
      titleRow.className = 'bar-title-row';
      titleRow.innerHTML = `
        <div class="bar-title">Profil ${i+1}</div>
        <div class="bar-meta">Kullanım: ${fmt(bar.used)} / ${fmt(usable)} mm &nbsp;·&nbsp; Fire: <span class="fire-pct">${fmt(remainder + 2*trim)} mm (%${fmt(barFirePct)})</span></div>
      `;
      card.appendChild(titleRow);

      const track = document.createElement('div');
      track.className = 'bar-track';

      function seg(cls, pct, label, bg, title){
        const d = document.createElement('div');
        d.className = 'seg ' + cls;
        d.style.width = Math.max(pct,0) + '%';
        if(bg) d.style.background = bg;
        if(title) d.title = title;
        if(label) d.innerHTML = `<span>${label}</span>`;
        return d;
      }

      const trimPct = trim/stockLength*100;
      track.appendChild(seg('seg-trim', trimPct, '', null, `Uç temizleme payı: ${fmt(trim)} mm`));

      bar.items.forEach((it, idx)=>{
        if(idx>0){
          const kerfPct = kerf/stockLength*100;
          track.appendChild(seg('seg-kerf', kerfPct, '', null, `Testere payı: ${fmt(kerf)} mm`));
        }
        const pct = it.length/stockLength*100;
        const showLabel = pct >= 6;
        const s = seg('seg-piece', pct, showLabel ? fmt(it.length) : '', it.color, `${it.name}: ${fmt(it.length)} mm`);
        s.style.color = '#fff';
        track.appendChild(s);
      });

      if(remainder > 0.01){
        const wastePct = remainder/stockLength*100;
        track.appendChild(seg('seg-waste', wastePct, wastePct>=6?fmt(remainder):'', null, `Kalan fire: ${fmt(remainder)} mm`));
      }

      track.appendChild(seg('seg-trim', trimPct, '', null, `Uç temizleme payı: ${fmt(trim)} mm`));

      card.appendChild(track);

      const comp = document.createElement('div');
      comp.className = 'bar-composition';
      comp.textContent = 'Parçalar: ' + bar.items.map(it=>fmt(it.length)+' mm').join(' + ') +
        (remainder>0.01 ? `  |  Kalan fire: ${fmt(remainder)} mm` : '');
      card.appendChild(comp);

      barsContainer.appendChild(card);
    });

    document.getElementById('resultsPanel').style.display = '';
    document.getElementById('visualPanel').style.display = '';
  }

  document.getElementById('calcBtn').addEventListener('click', ()=>{
    showError('');
    saveState();
    const ctx = readInputs();

    if(isNaN(ctx.stockLength) || ctx.stockLength<=0){
      showError('Lütfen geçerli bir profil boyu girin.'); return;
    }
    if(isNaN(ctx.trim) || ctx.trim<0){
      showError('Lütfen geçerli bir uç temizleme payı girin.'); return;
    }
    if(isNaN(ctx.kerf) || ctx.kerf<0){
      showError('Lütfen geçerli bir testere payı girin.'); return;
    }
    if(ctx.stockLength - 2*ctx.trim <= 0){
      showError('Uç temizleme payları profil boyundan büyük veya eşit olamaz.'); return;
    }
    if(ctx.pieces.length===0){
      showError('Lütfen en az bir geçerli parça satırı girin (boy ve adet).'); return;
    }

    const result = optimize(ctx.stockLength, ctx.trim, ctx.kerf, ctx.pieces);
    if(result.error){
      showError(result.error);
      document.getElementById('resultsPanel').style.display = 'none';
      document.getElementById('visualPanel').style.display = 'none';
      return;
    }
    render(result, ctx);
  });

})();
