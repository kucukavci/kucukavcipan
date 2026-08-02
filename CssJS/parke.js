 // ---------- DOM referansları ----------
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const tooltip = document.getElementById("tooltip");
    const statsDiv = document.getElementById("stats");
    const errorBox = document.getElementById("errorBox");
    const canvasWrapper = document.getElementById("canvasWrapper");

    let tiles = [];        // ekranda çizilen parçalar (tooltip/tıklama için)
    let lastLayout = null; // en son hesaplanan yerleşim (maliyet/PDF için)
    let zoomLevel = 1;
    let baseW = 0, baseH = 0;
    const RENDER_SCALE = 2; // 1 cm = 2 px (iç çözünürlük)
    const CANVAS_BG = "#fdfaf5";

    // ---------- localStorage: durumu kaydet / geri yükle ----------
    const PARKE_STORAGE_KEY = 'panel_parkeOP_state_v1';
    const PARKE_FIELDS = ['roomWidth','roomHeight','tileLength','tileHeight','margin','cutLoss','minLength','minWidth','pattern'];
    function saveParkeState(){
      try{
        const state = {};
        PARKE_FIELDS.forEach(id=>{
          const el = document.getElementById(id);
          if(el) state[id] = el.value;
        });
        const boxPrice = document.getElementById('boxPrice');
        const boxCoverage = document.getElementById('boxCoverage');
        if(boxPrice) state.boxPrice = boxPrice.value;
        if(boxCoverage) state.boxCoverage = boxCoverage.value;
        localStorage.setItem(PARKE_STORAGE_KEY, JSON.stringify(state));
      }catch(e){ /* localStorage kullanılamıyorsa sessizce geç */ }
    }
    function loadParkeState(){
      try{
        const raw = localStorage.getItem(PARKE_STORAGE_KEY);
        if(!raw) return false;
        const state = JSON.parse(raw);
        PARKE_FIELDS.forEach(id=>{
          const el = document.getElementById(id);
          if(el && state[id] !== undefined) el.value = state[id];
        });
        const boxPrice = document.getElementById('boxPrice');
        const boxCoverage = document.getElementById('boxCoverage');
        if(boxPrice && state.boxPrice !== undefined) boxPrice.value = state.boxPrice;
        if(boxCoverage && state.boxCoverage !== undefined) boxCoverage.value = state.boxCoverage;
        return true;
      }catch(e){ return false; }
    }

    let gapPattern = null;
    function getGapPattern() {
      if (gapPattern) return gapPattern;
      const off = document.createElement("canvas");
      off.width = 10; off.height = 10;
      const octx = off.getContext("2d");
      octx.fillStyle = "#f2f2f2";
      octx.fillRect(0, 0, 10, 10);
      octx.strokeStyle = "#dcdcdc";
      octx.lineWidth = 2;
      octx.beginPath();
      octx.moveTo(0, 10); octx.lineTo(10, 0);
      octx.moveTo(-2.5, 2.5); octx.lineTo(2.5, -2.5);
      octx.moveTo(7.5, 12.5); octx.lineTo(12.5, 7.5);
      octx.stroke();
      gapPattern = ctx.createPattern(off, "repeat");
      return gapPattern;
    }

    // ---------- Girdileri oku ----------
    function getValues() {
      return {
        roomWidth: +document.getElementById("roomWidth").value,
        roomHeight: +document.getElementById("roomHeight").value,
        tileLength: +document.getElementById("tileLength").value,
        tileHeight: +document.getElementById("tileHeight").value,
        margin: +document.getElementById("margin").value,
        cutLoss: +document.getElementById("cutLoss").value,
        minLength: +document.getElementById("minLength").value,
        minWidth: +document.getElementById("minWidth").value,
        pattern: document.getElementById("pattern").value,
      };
    }

    // ---------- Girdi doğrulama ----------
    function validateInputs(v) {
      const errors = [];

      if (!(v.roomWidth > 0)) errors.push("Oda genişliği 0'dan büyük olmalı.");
      if (!(v.roomHeight > 0)) errors.push("Oda yüksekliği 0'dan büyük olmalı.");
      if (!(v.tileLength > 0)) errors.push("Parke uzunluğu 0'dan büyük olmalı.");
      if (!(v.tileHeight > 0)) errors.push("Parke genişliği 0'dan büyük olmalı.");
      if (v.margin < 0) errors.push("Duvar boşluğu negatif olamaz.");
      if (v.cutLoss < 0) errors.push("Testere payı negatif olamaz.");
      if (v.minLength < 0) errors.push("Minimum parke uzunluğu negatif olamaz.");
      if (v.minWidth < 0) errors.push("Minimum parke genişliği negatif olamaz.");

      if (errors.length > 0) return errors;

      if (v.margin * 2 >= v.roomWidth || v.margin * 2 >= v.roomHeight) {
        errors.push("Duvar boşluğu oda ölçülerine göre çok büyük; kullanılabilir alan kalmıyor.");
      }
      if (v.cutLoss >= v.tileLength) {
        errors.push("Testere payı, parke uzunluğundan küçük olmalı.");
      }
      if (v.minLength >= v.tileLength) {
        errors.push("Minimum parke uzunluğu, parke uzunluğundan küçük olmalı.");
      }
      if (v.minWidth > v.tileHeight) {
        errors.push("Minimum parke genişliği, parke genişliğinden büyük olamaz.");
      }

      if (errors.length > 0) return errors;

      const usableW = v.roomWidth - v.margin * 2;
      const usableH = v.roomHeight - v.margin * 2;
      const usable_v = v.pattern === "yatay" ? usableW : usableH;
      const usable_u = v.pattern === "yatay" ? usableH : usableW;

      const estRows = usable_v / v.tileHeight;
      if (estRows > 1500) {
        errors.push("Bu ölçülerle çok fazla sıra oluşuyor. Parke genişliğini kontrol edin.");
      }
      const estCols = usable_u / v.tileLength;
      if (estCols > 3000) {
        errors.push("Bu ölçülerle çok fazla parça oluşuyor. Parke uzunluğunu kontrol edin.");
      }

      return errors;
    }

    // ---------- Yerleşim hesaplama (yön bağımsız) ----------
    // "duz"  : parke uzunluğu oda genişliği boyunca yatay gider, sıralar yukarıdan aşağı istiflenir
    // "yatay": parke uzunluğu oda yüksekliği boyunca dikey gider, sıralar soldan sağa istiflenir
    // Oda sonunda tam bir sıraya yetmeyen boşluk kalırsa (genişlik yönünde artık), bu şerit de
    // -eğer minimum genişlikten büyükse- parke genişliği optimize edilerek (dar kesilerek) döşenir.
    function layoutRoom(v) {
      const usableW = v.roomWidth - v.margin * 2;
      const usableH = v.roomHeight - v.margin * 2;

      const yatay = v.pattern === "yatay";
      const usable_u = yatay ? usableH : usableW;
      const usable_v = yatay ? usableW : usableH;

      const tileArea = v.tileLength * v.tileHeight;
      const tilesOut = [];

      let fullCount = 0, cutCount = 0, boardsCut = 0;
      let wasteArea = 0;  // satın alınan tahtalardan boşa giden alan (fire)
      let gapArea = 0;    // hiç döşenemeyen, duvar dibinde kalan alan
      let leftPiece = null;

      const EPS = 1e-9;
      const maxRows = 2000, maxCols = 5000;

      function pushTile(uStart, vStart, uLen, vLen, isCut, isWidthCut, isGap) {
        let x, y, w, h;
        if (yatay) { x = vStart; y = uStart; w = vLen; h = uLen; }
        else { x = uStart; y = vStart; w = uLen; h = vLen; }

        let label;
        if (isGap) label = `Boşluk: ${vLen.toFixed(1)} cm`;
        else if (isWidthCut) label = `${uLen.toFixed(1)} × ${vLen.toFixed(1)} cm`;
        else label = `${uLen.toFixed(1)} cm`;

        tilesOut.push({ x, y, w, h, isCut: !!isCut, isWidthCut: !!isWidthCut, isGap: !!isGap, label });
      }

      function fillRow(vStart, vThick, isWidthCut) {
        let uPos = v.margin;

        if (!isWidthCut && leftPiece !== null && leftPiece - v.cutLoss >= v.minLength) {
          const usable = leftPiece - v.cutLoss;
          pushTile(uPos, vStart, usable, vThick, true, isWidthCut, false);
          cutCount++;
          if (isWidthCut) wasteArea += usable * (v.tileHeight - vThick);
          uPos += usable;
          leftPiece = null;
        }

        let colSafety = 0;
        while (uPos + v.tileLength <= v.margin + usable_u + EPS && colSafety < maxCols) {
          pushTile(uPos, vStart, v.tileLength, vThick, false, isWidthCut, false);
          fullCount++;
          if (isWidthCut) wasteArea += v.tileLength * (v.tileHeight - vThick);
          uPos += v.tileLength;
          colSafety++;
        }

        const kalan = (v.margin + usable_u) - uPos;
        if (kalan > 1) {
          pushTile(uPos, vStart, kalan, vThick, true, isWidthCut, false);
          cutCount++;
          boardsCut++;
          if (isWidthCut) wasteArea += kalan * (v.tileHeight - vThick);

          const remaining = v.tileLength - kalan;
          if (!isWidthCut && (remaining - v.cutLoss) >= v.minLength) {
            leftPiece = remaining;
          } else {
            wasteArea += remaining * v.tileHeight;
          }
        }
      }

      let vPos = v.margin;
      let rowSafety = 0;
      while (vPos + v.tileHeight <= v.margin + usable_v + EPS && rowSafety < maxRows) {
        rowSafety++;
        fillRow(vPos, v.tileHeight, false);
        vPos += v.tileHeight;
      }

      // Kullanılmadan kalan uzunluk artığı varsa (bir sonraki normal sıra hiç gelmediyse) fireye eklenir
      if (leftPiece !== null) {
        wasteArea += leftPiece * v.tileHeight;
        leftPiece = null;
      }

      // Oda sonunda genişlik yönünde kalan şerit
      const remV = (v.margin + usable_v) - vPos;
      if (remV > 0.3) {
        if (remV >= v.minWidth) {
          fillRow(vPos, remV, true);
        } else {
          pushTile(v.margin, vPos, usable_u, remV, false, false, true);
          gapArea += usable_u * remV;
        }
      }

      const totalBoards = fullCount + boardsCut;
      const totalMaterialArea = totalBoards * tileArea;
      const coveredArea = tilesOut.filter(t => !t.isGap).reduce((s, t) => s + t.w * t.h, 0);
      const fireRate = totalMaterialArea > 0 ? (wasteArea / totalMaterialArea) * 100 : 0;

      return {
        tiles: tilesOut, fullCount, cutCount, boardsCut, totalBoards,
        wasteArea, gapArea, tileArea, totalMaterialArea, coveredArea, fireRate,
      };
    }

    // ---------- Çizim ----------
    function drawTileOnCanvas(t) {
      const sx = t.x * RENDER_SCALE;
      const sy = t.y * RENDER_SCALE;
      const sw = t.w * RENDER_SCALE;
      const sh = t.h * RENDER_SCALE;

      if (t.isGap) {
        ctx.fillStyle = getGapPattern();
        ctx.fillRect(sx, sy, sw, sh);
        ctx.save();
        ctx.strokeStyle = "#b23b3b";
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      } else {
        const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
        if (t.isCut) {
          grad.addColorStop(0, "#f0d3a0");
          grad.addColorStop(1, "#d1a565");
        } else {
          grad.addColorStop(0, "#c9a06c");
          grad.addColorStop(1, "#a87b45");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(sx, sy, sw, sh);

        ctx.save();
        ctx.strokeStyle = t.isCut ? "#8a5a2b" : "#6b4423";
        if (t.isCut) ctx.setLineDash([4, 3]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
      }

      const minDim = Math.min(sw, sh);
      if (minDim >= 16) {
        ctx.fillStyle = t.isGap ? "#8a8a8a" : "#2b1c0e";
        const fontSize = Math.max(7, Math.min(sw / 6, sh / 2, 12));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        if (sh > sw) { // dikey parça: etiketi döndürerek yaz
          ctx.translate(sx + sw / 2, sy + sh / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(t.label, 0, 0);
        } else {
          ctx.fillText(t.label, sx + sw / 2, sy + sh / 2);
        }
        ctx.restore();
      }

      tiles.push({ x: sx, y: sy, width: sw, height: sh, label: t.label });
    }

    function renderLayout(layout, roomWidth, roomHeight) {
      tiles = [];
      canvas.width = roomWidth * RENDER_SCALE;
      canvas.height = roomHeight * RENDER_SCALE;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.background = CANVAS_BG;

      layout.tiles.forEach(t => drawTileOnCanvas(t));

      baseW = canvas.width;
      baseH = canvas.height;
    }

    function updateStats(layout) {
      let gapLine = "";
      if (layout.gapArea > 0) {
        gapLine = `<br><span class="warn"><strong>Döşenemeyen Boşluk:</strong> ${layout.gapArea.toFixed(1)} cm² (minimum genişlikten dar bir şerit — profil/silme ile kapatılması gerekebilir)</span>`;
      }
      statsDiv.innerHTML = `
        <strong>Tam Parke:</strong> ${layout.fullCount} adet<br>
        <strong>Kesilmiş Parça:</strong> ${layout.cutCount} adet<br>
        <strong>Kullanılan Toplam Parke (Tahta):</strong> ${layout.totalBoards} adet<br>
        <strong>Kaplanan Alan:</strong> ${(layout.coveredArea / 10000).toFixed(2)} m²<br>
        <strong>Fire Alanı:</strong> ${layout.wasteArea.toFixed(1)} cm²<br>
        <strong>Fire Oranı:</strong> %${layout.fireRate.toFixed(2)}${gapLine}
      `;
    }

    // ---------- Ana akış ----------
    function drawFloor() {
      const v = getValues();
      const errors = validateInputs(v);

      if (errors.length > 0) {
        errorBox.innerHTML = errors.map(e => `• ${e}`).join("<br>");
        errorBox.style.display = "block";
        return;
      }
      errorBox.style.display = "none";
      tooltip.style.display = "none";

      const layout = layoutRoom(v);
      lastLayout = layout;
      renderLayout(layout, v.roomWidth, v.roomHeight);
      updateStats(layout);
      fitToScreen();
      saveParkeState();
    }

    // ---------- Tıklama / tooltip (zoom'a göre koordinat düzeltmesi) ----------
    canvas.addEventListener("click", function (e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      let closest = null;
      let closestDist = Infinity;

      for (let tile of tiles) {
        const cx = tile.x + tile.width / 2;
        const cy = tile.y + tile.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist && dist < 40) {
          closest = tile;
          closestDist = dist;
        }
      }

      if (closest) {
        tooltip.innerText = closest.label;
        tooltip.style.left = `${e.clientX + 10}px`;
        tooltip.style.top = `${e.clientY + 10}px`;
        tooltip.style.display = "block";
      } else {
        tooltip.style.display = "none";
      }
    });

    // ---------- Zoom / Pan (mobil uyumlu) ----------
    function applyZoom() {
      if (baseW === 0) return;
      canvas.style.width = (baseW * zoomLevel) + "px";
      canvas.style.height = (baseH * zoomLevel) + "px";
    }
    function zoomIn() { zoomLevel = Math.min(zoomLevel * 1.25, 6); applyZoom(); }
    function zoomOut() { zoomLevel = Math.max(zoomLevel / 1.25, 0.15); applyZoom(); }
    function fitToScreen() {
      if (baseW === 0) return;
      const available = canvasWrapper.clientWidth - 4;
      zoomLevel = available > 0 ? Math.min(1, available / baseW) : 1;
      applyZoom();
    }

    let pinchStartDist = null;
    let pinchStartZoom = 1;
    function touchDist(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    canvasWrapper.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = touchDist(e.touches);
        pinchStartZoom = zoomLevel;
      }
    }, { passive: true });
    canvasWrapper.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        e.preventDefault();
        const dist = touchDist(e.touches);
        zoomLevel = Math.min(6, Math.max(0.15, pinchStartZoom * (dist / pinchStartDist)));
        applyZoom();
      }
    }, { passive: false });
    canvasWrapper.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) pinchStartDist = null;
    });
    window.addEventListener("resize", () => { if (baseW > 0) fitToScreen(); });

    // ---------- Malzeme / Maliyet (opsiyonel) ----------
    function toggleCostSection() {
      const el = document.getElementById("costSection");
      el.style.display = el.style.display === "none" ? "block" : "none";
    }

    function calculateCost() {
      const resultDiv = document.getElementById("costResult");
      if (!lastLayout) {
        resultDiv.innerHTML = `<span style="color:#b23b3b">Önce "Parkeleri Yerleştir" ile bir hesaplama yapın.</span>`;
        return;
      }
      const price = +document.getElementById("boxPrice").value;
      const coverage = +document.getElementById("boxCoverage").value;

      if (!(price >= 0) || !(coverage > 0)) {
        resultDiv.innerHTML = `<span style="color:#b23b3b">Lütfen geçerli bir kutu fiyatı ve kutu alanı (m²) girin.</span>`;
        return;
      }

      const totalAreaM2 = (lastLayout.totalBoards * lastLayout.tileArea) / 10000;
      const neededBoxes = Math.ceil(totalAreaM2 / coverage);
      const totalCost = neededBoxes * price;

      resultDiv.innerHTML = `
        <strong>Gereken Toplam Parke Alanı:</strong> ${totalAreaM2.toFixed(2)} m²<br>
        <strong>Gereken Kutu Sayısı:</strong> ${neededBoxes} kutu<br>
        <strong>Toplam Maliyet:</strong> ${totalCost.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
      `;
      saveParkeState();
    }

    /* ---------- kayıtlı durumu geri yükle (sayfa açılışında) ---------- */
    if(loadParkeState()){
      // Kayıtlı ölçüler geçerliyse yerleşimi otomatik olarak yeniden çiz
      const v = getValues();
      if(validateInputs(v).length === 0) drawFloor();
    }

    // ---------- Dışa aktarma ----------
    function downloadImage() {
      const link = document.createElement("a");
      link.download = "parke-yerlesim.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    }

    async function downloadPDF() {
      if (!lastLayout) { drawFloor(); }
      const stats = statsDiv.innerText;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();

      const imgData = canvas.toDataURL("image/png");
      pdf.setFontSize(16);
      pdf.text("Parke Yerleşim Raporu", 20, 20);
      pdf.setFontSize(12);
      const lines = pdf.splitTextToSize(stats, 170);
      pdf.text(lines, 20, 30);

      const imgWidth = 180;
      const imgHeight = imgWidth * (canvas.height / canvas.width);
      pdf.addImage(imgData, "PNG", 15, 60, imgWidth, imgHeight);

      const today = new Date().toISOString().split("T")[0];
      pdf.save(`parke-raporu-${today}.pdf`);
    }
