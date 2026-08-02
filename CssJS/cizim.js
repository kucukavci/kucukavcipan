const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const panel = document.getElementById('properties-panel');

        const inputLength = document.getElementById('input-length');
        const inputAngle = document.getElementById('input-angle');
        const inputThickness = document.getElementById('input-thickness');
        const inputCut1 = document.getElementById('input-cut1');
        const inputCut2 = document.getElementById('input-cut2');

        const PX_PER_CM = 10;
        const SNAP_TOLERANCE_PX = 25;   // ekran pikseli cinsinden - zoom'dan bağımsız hissettirir
        const SNAP_PREVIEW_PX = 65;     // yakındaki olası noktaları önizleme yarıçapı

        // ---------- localStorage: durumu kaydet / geri yükle ----------
        const CIZIM_STORAGE_KEY = 'panel_cizimSablonu_state_v1';
        function saveCizimState(){
            try{
                const state = { lines, nextId, viewScale, viewX, viewY };
                localStorage.setItem(CIZIM_STORAGE_KEY, JSON.stringify(state));
            }catch(e){ /* localStorage kullanılamıyorsa sessizce geç */ }
        }
        function loadCizimState(){
            try{
                const raw = localStorage.getItem(CIZIM_STORAGE_KEY);
                if(!raw) return null;
                return JSON.parse(raw);
            }catch(e){ return null; }
        }

        let lines = [];
        let nextId = 1;
        let isInteracting = false;
        let startX, startY, currentX, currentY;
        let activeSnapPoint = null;
        let nearbySnapPoints = [];

        let currentMode = 'draw';
        let selectedLine = null;
        let dragOffsetX = 0, dragOffsetY = 0;

        const btnDraw = document.getElementById('btn-draw');
        const btnMove = document.getElementById('btn-move');

        // --- Görünüm (Zoom / Pan) durumu ---
        let viewScale = 1;
        let viewX = 0;
        let viewY = 0;
        let panLastX = 0, panLastY = 0;

        // --- İki parmakla yakınlaştırma (pinch) durumu ---
        let isPinching = false;
        let pinchStartDist = 0;
        let pinchLastMid = { x: 0, y: 0 };

        function resizeCanvas() {
            const vv = window.visualViewport;
            if (vv) {
                canvas.width = vv.width;
                canvas.height = vv.height;
            } else {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            redraw();
        }
        window.addEventListener('resize', resizeCanvas);
        // iOS Safari'de adres çubuğu açılıp kapandığında gerçek görünür alan
        // window.innerHeight'tan farklı olabiliyor; visualViewport bunu doğru takip eder,
        // böylece alt bar/panel ekran dışına kaymaz.
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', resizeCanvas);
            window.visualViewport.addEventListener('scroll', resizeCanvas);
        }
        resizeCanvas();

        // Ham ekran (client) koordinatları
        function getScreenCoordinates(e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            if (e.changedTouches && e.changedTouches.length > 0) {
                return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }

        // Ekran koordinatlarını dünya (çizim) koordinatlarına çevirir (zoom/pan dikkate alınır)
        function getCoordinates(e) {
            const s = getScreenCoordinates(e);
            return { x: (s.x - viewX) / viewScale, y: (s.y - viewY) / viewScale };
        }

        document.getElementById('btn-draw').addEventListener('click', (e) => {
            currentMode = 'draw';
            updateModeUI(e.currentTarget);
            selectLine(null);
        });

        document.getElementById('btn-move').addEventListener('click', (e) => {
            currentMode = 'move';
            updateModeUI(e.currentTarget);
        });

        document.getElementById('btn-pan').addEventListener('click', (e) => {
            currentMode = 'pan';
            updateModeUI(e.currentTarget);
        });

        function updateModeUI(activeBtn) {
            document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
            activeBtn.classList.add('active');
            if (currentMode === 'pan') canvas.style.cursor = 'grab';
            else if (currentMode === 'move') canvas.style.cursor = 'pointer';
            else canvas.style.cursor = 'crosshair';
        }

        // Bir parçanın eksen uçlarını, 4 köşesini ve üst/alt kenar orta noktalarını
        // dünya koordinatlarında döndürür. Kesim açıları (cut1/cut2) da hesaba katılır,
        // böylece görünen şekille (drawProfile) birebir aynı noktalar elde edilir.
        function getProfileSnapPoints(line) {
            let dx = line.x2 - line.x1, dy = line.y2 - line.y1;
            let length = Math.hypot(dx, dy);
            let angle = Math.atan2(dy, dx);
            let t = (line.thicknessCm || 4) * PX_PER_CM;
            let c1 = (line.cut1 || 0) * Math.PI / 180;
            let c2 = (line.cut2 || 0) * Math.PI / 180;
            let offset1 = (t / 2) * Math.tan(c1);
            let offset2 = (t / 2) * Math.tan(c2);
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const toWorld = (lx, ly) => ({ x: line.x1 + lx * cosA - ly * sinA, y: line.y1 + lx * sinA + ly * cosA });

            const TL = toWorld(offset1, -t / 2);
            const TR = toWorld(length + offset2, -t / 2);
            const BR = toWorld(length - offset2, t / 2);
            const BL = toWorld(-offset1, t / 2);
            const topMid = { x: (TL.x + TR.x) / 2, y: (TL.y + TR.y) / 2 };
            const botMid = { x: (BL.x + BR.x) / 2, y: (BL.y + BR.y) / 2 };

            return [
                { x: line.x1, y: line.y1, type: 'axis' },
                { x: line.x2, y: line.y2, type: 'axis' },
                { x: TL.x, y: TL.y, type: 'corner' },
                { x: TR.x, y: TR.y, type: 'corner' },
                { x: BR.x, y: BR.y, type: 'corner' },
                { x: BL.x, y: BL.y, type: 'corner' },
                { x: topMid.x, y: topMid.y, type: 'edge' },
                { x: botMid.x, y: botMid.y, type: 'edge' },
            ];
        }

        // Renk kodu: yeşil = eksen ucu, turuncu = köşe, mavi = kenar orta noktası
        function snapColor(type, alpha) {
            if (type === 'corner') return `rgba(247,127,0,${alpha})`;
            if (type === 'edge') return `rgba(76,201,240,${alpha})`;
            return `rgba(6,214,160,${alpha})`;
        }

        function getSnapPoint(x, y, excludeLine = null) {
            const tol = SNAP_TOLERANCE_PX / viewScale;
            let best = null;
            let bestDist = tol;
            for (let i = 0; i < lines.length; i++) {
                let l = lines[i];
                if (l === excludeLine) continue;
                for (let pt of getProfileSnapPoints(l)) {
                    let d = Math.hypot(pt.x - x, pt.y - y);
                    if (d < bestDist) { bestDist = d; best = pt; }
                }
            }
            if (best) return { x: best.x, y: best.y, snapped: true, type: best.type };
            return { x: x, y: y, snapped: false };
        }

        // Sürüklerken yakındaki tüm olası yapışma noktalarını (önizleme için) döndürür
        function getNearbySnapPoints(x, y, excludeLine = null) {
            const radius = SNAP_PREVIEW_PX / viewScale;
            let found = [];
            for (let i = 0; i < lines.length; i++) {
                let l = lines[i];
                if (l === excludeLine) continue;
                for (let pt of getProfileSnapPoints(l)) {
                    if (Math.hypot(pt.x - x, pt.y - y) < radius) found.push(pt);
                }
            }
            return found;
        }

        // --- Zoom yardımcı fonksiyonu (ekran noktası referans alınarak) ---
        function zoomAt(screenX, screenY, factor) {
            const newScale = Math.min(6, Math.max(0.2, viewScale * factor));
            const worldX = (screenX - viewX) / viewScale;
            const worldY = (screenY - viewY) / viewScale;
            viewScale = newScale;
            viewX = screenX - worldX * viewScale;
            viewY = screenY - worldY * viewScale;
            redraw();
        }

        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            zoomAt(canvas.width / 2, canvas.height / 2, 1.25);
        });
        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            zoomAt(canvas.width / 2, canvas.height / 2, 0.8);
        });
        document.getElementById('zoom-indicator').addEventListener('click', () => {
            viewScale = 1; viewX = 0; viewY = 0;
            redraw();
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : (1 / 1.1);
            zoomAt(e.clientX, e.clientY, factor);
        }, { passive: false });

        function startInteraction(e) {
            // İki parmakla pinch-zoom başlangıcı
            if (e.touches && e.touches.length === 2) {
                isInteracting = false;
                isPinching = true;
                const t0 = e.touches[0], t1 = e.touches[1];
                pinchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
                pinchLastMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
                return;
            }

            if (e.target !== canvas) return;
            e.preventDefault();

            if (currentMode === 'pan') {
                const screen = getScreenCoordinates(e);
                isInteracting = true;
                panLastX = screen.x;
                panLastY = screen.y;
                canvas.style.cursor = 'grabbing';
                return;
            }

            const coords = getCoordinates(e);
            let snap = getSnapPoint(coords.x, coords.y);
            startX = snap.x;
            startY = snap.y;
            currentX = snap.x;
            currentY = snap.y;
            activeSnapPoint = snap.snapped ? snap : null;

            if (currentMode === 'draw') {
                isInteracting = true;
                selectLine(null);
            } else if (currentMode === 'move') {
                let clickedLine = findLineNear(coords.x, coords.y);
                if (clickedLine) {
                    selectLine(clickedLine);
                    isInteracting = true;
                    dragOffsetX = coords.x - clickedLine.x1;
                    dragOffsetY = coords.y - clickedLine.y1;
                } else {
                    selectLine(null);
                }
            }
        }

        function moveInteraction(e) {
            // Pinch-zoom devam ediyor
            if (isPinching && e.touches && e.touches.length === 2) {
                e.preventDefault();
                const t0 = e.touches[0], t1 = e.touches[1];
                const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
                const mid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
                const factor = dist / pinchStartDist;
                zoomAt(mid.x, mid.y, factor);
                viewX += (mid.x - pinchLastMid.x);
                viewY += (mid.y - pinchLastMid.y);
                redraw();
                pinchStartDist = dist;
                pinchLastMid = mid;
                return;
            }

            if (!isInteracting) return;
            e.preventDefault();

            if (currentMode === 'pan') {
                const screen = getScreenCoordinates(e);
                viewX += (screen.x - panLastX);
                viewY += (screen.y - panLastY);
                panLastX = screen.x;
                panLastY = screen.y;
                redraw();
                return;
            }

            const coords = getCoordinates(e);

            if (currentMode === 'draw') {
                nearbySnapPoints = getNearbySnapPoints(coords.x, coords.y);
                let snap = getSnapPoint(coords.x, coords.y);
                currentX = snap.x;
                currentY = snap.y;
                activeSnapPoint = snap.snapped ? snap : null;

                redraw();
                // Önizleme için geçici bir profil çiz
                let tempLine = {x1: startX, y1: startY, x2: currentX, y2: currentY, thicknessCm: parseFloat(inputThickness.value) || 4, cut1: 0, cut2: 0};
                drawWorld(() => drawProfile(tempLine, true));
            }
            else if (currentMode === 'move' && selectedLine) {
                let dx = selectedLine.x2 - selectedLine.x1;
                let dy = selectedLine.y2 - selectedLine.y1;

                let newX1 = coords.x - dragOffsetX;
                let newY1 = coords.y - dragOffsetY;
                let newX2 = newX1 + dx;
                let newY2 = newY1 + dy;

                // Taşınan parçanın bu geçici konumdaki TÜM olası yapışma noktaları
                // (eksen uçları + 4 köşe + 2 kenar orta noktası)
                let tentative = {
                    x1: newX1, y1: newY1, x2: newX2, y2: newY2,
                    thicknessCm: selectedLine.thicknessCm, cut1: selectedLine.cut1, cut2: selectedLine.cut2
                };
                let sourcePoints = getProfileSnapPoints(tentative);

                // Diğer tüm parçaların olası yapışma noktaları
                let targetPoints = [];
                lines.forEach(l => { if (l !== selectedLine) targetPoints.push(...getProfileSnapPoints(l)); });

                // En yakın kaynak-hedef nokta çiftini bul (köşe-köşe, kenar-kenar, eksen-eksen)
                const tol = SNAP_TOLERANCE_PX / viewScale;
                let best = null, bestDist = tol;
                sourcePoints.forEach(sp => {
                    targetPoints.forEach(tp => {
                        let d = Math.hypot(sp.x - tp.x, sp.y - tp.y);
                        if (d < bestDist) { bestDist = d; best = { source: sp, target: tp }; }
                    });
                });

                // Önizleme: parçanın noktalarına yakın tüm hedef noktalar
                const previewRadius = SNAP_PREVIEW_PX / viewScale;
                nearbySnapPoints = targetPoints.filter(tp =>
                    sourcePoints.some(sp => Math.hypot(sp.x - tp.x, sp.y - tp.y) < previewRadius)
                );

                let snapOffset = { x: 0, y: 0 };
                activeSnapPoint = null;
                if (best) {
                    snapOffset = { x: best.target.x - best.source.x, y: best.target.y - best.source.y };
                    activeSnapPoint = best.target;
                }

                selectedLine.x1 = newX1 + snapOffset.x;
                selectedLine.y1 = newY1 + snapOffset.y;
                selectedLine.x2 = newX2 + snapOffset.x;
                selectedLine.y2 = newY2 + snapOffset.y;

                redraw();
            }
        }

        function endInteraction(e) {
            if (e.touches && e.touches.length < 2) {
                isPinching = false;
            }

            if (!isInteracting) return;
            e.preventDefault();
            isInteracting = false;
            activeSnapPoint = null;
            nearbySnapPoints = [];

            if (currentMode === 'pan') {
                canvas.style.cursor = 'grab';
                redraw();
                return;
            }

            if (currentMode === 'draw') {
                const dist = Math.hypot(currentX - startX, currentY - startY);
                if (dist > 5) {
                    let newLine = {
                        id: nextId++,
                        x1: startX, y1: startY,
                        x2: currentX, y2: currentY,
                        thicknessCm: parseFloat(inputThickness.value) || 4,
                        cut1: 0,
                        cut2: 0
                    };
                    lines.push(newLine);

                    // Parça çizildiği an otomatik olarak Seç/Taşı moduna geç ve sadece o parçayı seçili yap.
                    // Böylece bir sonraki parçayı çizmek için tekrar "Çiz" butonuna basman gerekiyor.
                    currentMode = 'move';
                    updateModeUI(btnMove);
                    selectLine(newLine);
                }
            }
            redraw();
            saveCizimState();
        }

        function selectLine(line) {
            selectedLine = line;
            if (line) {
                panel.classList.add('panel-visible');
                updatePanelValues();
            } else {
                panel.classList.remove('panel-visible');
            }
            redraw();
        }

        function updatePanelValues() {
            if(!selectedLine) return;
            let dx = selectedLine.x2 - selectedLine.x1;
            let dy = selectedLine.y2 - selectedLine.y1;

            let lengthPx = Math.hypot(dx, dy);
            let lengthCm = lengthPx / PX_PER_CM;

            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            inputLength.value = lengthCm.toFixed(1);
            inputAngle.value = Math.round(angle);
            inputThickness.value = selectedLine.thicknessCm || 4;
            inputCut1.value = selectedLine.cut1 || 0;
            inputCut2.value = selectedLine.cut2 || 0;
        }

        document.getElementById('btn-apply').addEventListener('click', () => {
            if (!selectedLine) return;

            let newLengthPx = parseFloat(inputLength.value) * PX_PER_CM;
            let newAngle = parseFloat(inputAngle.value) * (Math.PI / 180);

            selectedLine.x2 = selectedLine.x1 + newLengthPx * Math.cos(newAngle);
            selectedLine.y2 = selectedLine.y1 + newLengthPx * Math.sin(newAngle);

            selectedLine.thicknessCm = parseFloat(inputThickness.value) || 0;
            selectedLine.cut1 = parseFloat(inputCut1.value) || 0;
            selectedLine.cut2 = parseFloat(inputCut2.value) || 0;

            redraw();
            saveCizimState();
        });

        document.getElementById('btn-delete').addEventListener('click', () => {
            if (!selectedLine) return;
            lines = lines.filter(l => l !== selectedLine);
            selectLine(null);
            saveCizimState();
        });

        function findLineNear(x, y) {
            const tolerance = 20;
            for (let i = lines.length - 1; i >= 0; i--) {
                let line = lines[i];
                let l2 = Math.pow(line.x2 - line.x1, 2) + Math.pow(line.y2 - line.y1, 2);
                let t = l2 === 0 ? 0 : ((x - line.x1) * (line.x2 - line.x1) + (y - line.y1) * (line.y2 - line.y1)) / l2;
                t = Math.max(0, Math.min(1, t));
                let projX = line.x1 + t * (line.x2 - line.x1);
                let projY = line.y1 + t * (line.y2 - line.y1);
                if (Math.hypot(x - projX, y - projY) <= tolerance) {
                    return line;
                }
            }
            return null;
        }

        // --- PROFİL VE KALINLIK ÇİZİM FONKSİYONU ---
        function drawProfile(line, isSelected) {
            let dx = line.x2 - line.x1;
            let dy = line.y2 - line.y1;
            let length = Math.hypot(dx, dy);
            let angle = Math.atan2(dy, dx);

            // Kalınlığı piksele çevir
            let t = (line.thicknessCm || 4) * PX_PER_CM;

            // Açıları (0 düz kesimdir) radyana çevir
            let c1 = (line.cut1 || 0) * Math.PI / 180;
            let c2 = (line.cut2 || 0) * Math.PI / 180;

            // Kesim açılarına göre alt/üst köşe çıkıntılarını hesapla (Matematiksel miter formülü)
            let offset1 = (t / 2) * Math.tan(c1);
            let offset2 = (t / 2) * Math.tan(c2);

            ctx.save();
            ctx.translate(line.x1, line.y1); // Başlangıç noktasına git
            ctx.rotate(angle); // Çizginin eğimine göre tuvali döndür

            // Geometrik Parçayı (Poligon) Çiz
            ctx.beginPath();
            ctx.moveTo(offset1, -t/2); // Sol Üst Köşe
            ctx.lineTo(length + offset2, -t/2); // Sağ Üst Köşe
            ctx.lineTo(length - offset2, t/2); // Sağ Alt Köşe
            ctx.lineTo(-offset1, t/2); // Sol Alt Köşe
            ctx.closePath();

            // Parça Renkleri
            ctx.fillStyle = isSelected ? 'rgba(239, 35, 60, 0.3)' : 'rgba(141, 153, 174, 0.5)';
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#d90429' : '#2b2d42';
            ctx.lineWidth = 2 / viewScale;
            ctx.stroke();

            // Tam Merkezden Geçen Aks (Eksen) Çizgisi
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(length, 0);
            ctx.strokeStyle = isSelected ? '#ef233c' : '#ffffff';
            ctx.lineWidth = 1 / viewScale;
            ctx.setLineDash([5 / viewScale, 5 / viewScale]); // Kesik çizgi efekti
            ctx.stroke();
            ctx.setLineDash([]); // Normale döndür

            ctx.restore();
        }

        function drawGrid() {
            ctx.strokeStyle = '#eef0f2';
            ctx.lineWidth = 1 / viewScale;
            const gridSize = PX_PER_CM * 5;

            const worldMinX = -viewX / viewScale;
            const worldMinY = -viewY / viewScale;
            const worldMaxX = (canvas.width - viewX) / viewScale;
            const worldMaxY = (canvas.height - viewY) / viewScale;

            const startXg = Math.floor(worldMinX / gridSize) * gridSize;
            const startYg = Math.floor(worldMinY / gridSize) * gridSize;

            for (let x = startXg; x < worldMaxX; x += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, worldMinY); ctx.lineTo(x, worldMaxY); ctx.stroke();
            }
            for (let y = startYg; y < worldMaxY; y += gridSize) {
                ctx.beginPath(); ctx.moveTo(worldMinX, y); ctx.lineTo(worldMaxX, y); ctx.stroke();
            }
        }

        function drawSnapPreview() {
            nearbySnapPoints.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 3.5 / viewScale, 0, 2 * Math.PI);
                ctx.fillStyle = snapColor(pt.type, 0.4);
                ctx.fill();
            });
        }

        function drawSnapIndicator() {
            if (!activeSnapPoint) return;
            ctx.beginPath();
            ctx.arc(activeSnapPoint.x, activeSnapPoint.y, 8 / viewScale, 0, 2 * Math.PI);
            ctx.strokeStyle = snapColor(activeSnapPoint.type || 'axis', 1);
            ctx.lineWidth = 3 / viewScale;
            ctx.stroke();
        }

        // Dünya (zoom/pan) dönüşümü içinde bir çizim fonksiyonu çalıştırır
        function drawWorld(fn) {
            ctx.save();
            ctx.translate(viewX, viewY);
            ctx.scale(viewScale, viewScale);
            fn();
            ctx.restore();
        }

        // Her parçanın üzerine uzunluk (ve seçiliyse kalınlık/açı) etiketi çizer.
        // Etiketler ekran uzayında (zoom'dan bağımsız sabit boyutta) çizilir.
        function drawLabels() {
            lines.forEach(line => {
                let dx = line.x2 - line.x1;
                let dy = line.y2 - line.y1;
                let lengthCm = Math.hypot(dx, dy) / PX_PER_CM;
                let angle = Math.atan2(dy, dx);
                let midX = (line.x1 + line.x2) / 2;
                let midY = (line.y1 + line.y2) / 2;

                let screenX = viewX + midX * viewScale;
                let screenY = viewY + midY * viewScale;
                let perpX = -Math.sin(angle) * 16;
                let perpY = Math.cos(angle) * 16;
                let lx = screenX + perpX;
                let ly = screenY + perpY;

                const isSel = line === selectedLine;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let mainText = `#${line.id} · ${lengthCm.toFixed(1)}cm`;
                ctx.font = '11px Segoe UI, sans-serif';
                const padding = 5;
                const w = ctx.measureText(mainText).width + padding * 2;
                ctx.fillStyle = isSel ? 'rgba(217,4,41,0.85)' : 'rgba(43,45,66,0.75)';
                ctx.fillRect(lx - w / 2, ly - 9, w, 18);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(mainText, lx, ly);

                if (isSel) {
                    let subParts = [`t:${line.thicknessCm || 4}cm`];
                    if (line.cut1) subParts.push(`başl:${line.cut1}°`);
                    if (line.cut2) subParts.push(`bitiş:${line.cut2}°`);
                    let subText = subParts.join('  ');
                    ctx.font = '10px Segoe UI, sans-serif';
                    const w2 = ctx.measureText(subText).width + padding * 2;
                    const ly2 = ly + 18;
                    ctx.fillStyle = 'rgba(76,201,240,0.95)';
                    ctx.fillRect(lx - w2 / 2, ly2 - 8, w2, 16);
                    ctx.fillStyle = '#2b2d42';
                    ctx.fillText(subText, lx, ly2);
                }
            });
        }

        function updateZoomIndicator() {
            const el = document.getElementById('zoom-indicator');
            if (el) el.textContent = Math.round(viewScale * 100) + '%';
        }

        function renderListPanel() {
            const listPanel = document.getElementById('list-panel');
            if (!listPanel || listPanel.style.display !== 'block') return;

            const listContent = document.getElementById('list-content');
            const listTotal = document.getElementById('list-total');

            if (lines.length === 0) {
                listContent.innerHTML = '<div id="list-empty">Henüz parça yok</div>';
                listTotal.textContent = '';
                return;
            }

            let totalCm = 0;
            let rowsHtml = lines.map(line => {
                let dx = line.x2 - line.x1;
                let dy = line.y2 - line.y1;
                let lengthCm = Math.hypot(dx, dy) / PX_PER_CM;
                totalCm += lengthCm;
                const isSel = line === selectedLine;
                return `<div class="list-row${isSel ? ' list-row-active' : ''}" data-id="${line.id}">
                    <span class="list-row-info">
                        <span class="list-row-main">#${line.id} — ${lengthCm.toFixed(1)}cm (t:${line.thicknessCm || 4})</span>
                        <span class="list-row-sub">Açılar: ${line.cut1 || 0}° / ${line.cut2 || 0}°</span>
                    </span>
                    <span class="list-del" data-id="${line.id}">×</span>
                </div>`;
            }).join('');

            listContent.innerHTML = rowsHtml;
            listTotal.textContent = `Toplam: ${lines.length} parça, ${totalCm.toFixed(1)} cm (${(totalCm / 100).toFixed(2)} m)`;

            listContent.querySelectorAll('.list-del').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(el.getAttribute('data-id'));
                    const wasSelected = selectedLine && selectedLine.id === id;
                    lines = lines.filter(l => l.id !== id);
                    if (wasSelected) selectLine(null); else redraw();
                    saveCizimState();
                });
            });
            listContent.querySelectorAll('.list-row').forEach(el => {
                el.addEventListener('click', () => {
                    const id = parseInt(el.getAttribute('data-id'));
                    const line = lines.find(l => l.id === id);
                    if (line) selectLine(line);
                });
            });
        }

        document.getElementById('btn-list').addEventListener('click', (e) => {
            const listPanel = document.getElementById('list-panel');
            const isOpen = listPanel.style.display === 'block';
            listPanel.style.display = isOpen ? 'none' : 'block';
            e.currentTarget.classList.toggle('active', !isOpen);
            if (!isOpen) renderListPanel();
        });

        function redraw() {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            drawWorld(() => {
                drawGrid();
                lines.forEach(line => drawProfile(line, line === selectedLine));
                drawSnapPreview();
                drawSnapIndicator();
            });

            drawLabels();
            updateZoomIndicator();
            renderListPanel();
        }

        // Event Listeners
        canvas.addEventListener('mousedown', startInteraction);
        canvas.addEventListener('mousemove', moveInteraction);
        canvas.addEventListener('mouseup', endInteraction);
        canvas.addEventListener('mouseout', endInteraction);

        canvas.addEventListener('touchstart', startInteraction, {passive: false});
        canvas.addEventListener('touchmove', moveInteraction, {passive: false});
        canvas.addEventListener('touchend', endInteraction, {passive: false});
        canvas.addEventListener('touchcancel', endInteraction, {passive: false});

        document.getElementById('btn-clear').addEventListener('click', () => {
            if(confirm("Tüm çizimi temizlemek istediğinize emin misiniz?")) {
                lines = [];
                selectLine(null);
                saveCizimState();
            }
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            lines.pop();
            selectLine(null);
            saveCizimState();
        });

        /* ---------- kayıtlı durumu geri yükle (sayfa açılışında) ---------- */
        (function restoreCizimState(){
            const saved = loadCizimState();
            if(!saved) return;
            if(Array.isArray(saved.lines)) lines = saved.lines;
            if(typeof saved.nextId === 'number') nextId = saved.nextId;
            if(typeof saved.viewScale === 'number') viewScale = saved.viewScale;
            if(typeof saved.viewX === 'number') viewX = saved.viewX;
            if(typeof saved.viewY === 'number') viewY = saved.viewY;
            redraw();
        })();
