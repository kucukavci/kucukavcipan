const canvas = document.getElementById('canvas');
        let ctx = canvas.getContext('2d');
        const panel = document.getElementById('properties-panel');

        const inputLength = document.getElementById('input-length');
        const inputAngle = document.getElementById('input-angle');
        const inputThickness = document.getElementById('input-thickness');
        const inputCut1 = document.getElementById('input-cut1');
        const inputCut2 = document.getElementById('input-cut2');
        const inputName = document.getElementById('input-name');

        const PX_PER_CM = 10;
        const SNAP_TOLERANCE_PX = 25;   // ekran pikseli cinsinden - zoom'dan bağımsız hissettirir
        const SNAP_PREVIEW_PX = 65;     // yakındaki olası noktaları önizleme yarıçapı

        let lines = [];
        let nextId = 1;
        let isInteracting = false;
        let startX, startY, currentX, currentY;
        let activeSnapPoint = null;
        let nearbySnapPoints = [];

        let currentMode = 'draw';
        let selectedLine = null;
        let dragOffsetX = 0, dragOffsetY = 0;
        let isPanningCanvas = false; // boş alana dokunulduğunda otomatik kaydırma

        // --- Grup seçimi/taşıma durumu ---
        let groupSelectedIds = new Set();
        let groupPressLine = null;
        let groupIsDragging = false;
        let groupDragStartWorld = { x: 0, y: 0 };
        let groupSnapshot = [];

        // --- Hizalama kılavuz çizgileri (sürüklerken gösterilir) ---
        let alignmentGuides = [];

        // --- Görünüm renkleri (özelleştirilebilir) ---
        let canvasBgColor = '#ffffff';
        let gridColor = '#eef0f2';
        let pieceColor = '#8d99ae';

        function hexToRgba(hex, alpha) {
            const h = hex.replace('#', '');
            const r = parseInt(h.substring(0, 2), 16) || 0;
            const g = parseInt(h.substring(2, 4), 16) || 0;
            const b = parseInt(h.substring(4, 6), 16) || 0;
            return `rgba(${r},${g},${b},${alpha})`;
        }

        const THEME_STORAGE_KEY = 'iskelet-cizim-theme-v1';
        function saveTheme() {
            try {
                localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ canvasBgColor, gridColor, pieceColor }));
            } catch (e) { /* yoksay */ }
        }
        function loadTheme() {
            try {
                const raw = localStorage.getItem(THEME_STORAGE_KEY);
                if (!raw) return;
                const data = JSON.parse(raw);
                if (data.canvasBgColor) canvasBgColor = data.canvasBgColor;
                if (data.gridColor) gridColor = data.gridColor;
                if (data.pieceColor) pieceColor = data.pieceColor;
            } catch (e) { /* yoksay */ }
        }
        loadTheme();

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

        // ===== OTOMATİK KAYDETME (tarayıcı hafızası) =====
        const STORAGE_KEY = 'iskelet-cizim-autosave-v1';

        function autosave() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ nextId, lines }));
            } catch (e) { /* depolama kullanılamıyor - sessizce geç */ }
        }

        function loadAutosave() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                const data = JSON.parse(raw);
                if (data && Array.isArray(data.lines)) {
                    lines = data.lines;
                    nextId = data.nextId || (lines.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1);
                }
            } catch (e) { /* bozuk veri - yoksay */ }
        }

        loadAutosave();
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
            groupSelectedIds.clear();
        });

        document.getElementById('btn-move').addEventListener('click', (e) => {
            currentMode = 'move';
            updateModeUI(e.currentTarget);
            groupSelectedIds.clear();
            redraw();
        });

        document.getElementById('btn-group').addEventListener('click', (e) => {
            currentMode = 'group';
            updateModeUI(e.currentTarget);
            selectLine(null);
        });

        function updateModeUI(activeBtn) {
            document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
            activeBtn.classList.add('active');
            if (currentMode === 'draw') canvas.style.cursor = 'crosshair';
            else canvas.style.cursor = 'grab'; // 'move' ve 'group': boşluğa dokunursan kaydırır, parçaya dokunursan seçer
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
            let full1 = t * Math.tan(c1);
            let full2 = t * Math.tan(c2);
            const side1 = line.cut1Side || 'top'; // bu uçta hangi köşe SABİT (uzun nokta) kalır
            const side2 = line.cut2Side || 'top';
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const toWorld = (lx, ly) => ({ x: line.x1 + lx * cosA - ly * sinA, y: line.y1 + lx * sinA + ly * cosA });

            // Başlangıç ucu: seçilen köşe (üst/alt) tam eksen başlangıcında (x=0) sabit kalır,
            // diğer köşe içeri doğru kesilir.
            let TLx = side1 === 'top' ? 0 : full1;
            let BLx = side1 === 'top' ? full1 : 0;
            // Bitiş ucu: seçilen köşe tam eksen sonunda (x=length) sabit kalır.
            let TRx = side2 === 'top' ? length : length - full2;
            let BRx = side2 === 'top' ? length - full2 : length;

            const TL = toWorld(TLx, -t / 2);
            const TR = toWorld(TRx, -t / 2);
            const BR = toWorld(BRx, t / 2);
            const BL = toWorld(BLx, t / 2);
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

            const coords = getCoordinates(e);

            if (currentMode === 'draw') {
                let snap = getSnapPoint(coords.x, coords.y);
                startX = snap.x;
                startY = snap.y;
                currentX = snap.x;
                currentY = snap.y;
                activeSnapPoint = snap.snapped ? snap : null;
                isInteracting = true;
                selectLine(null);
            } else if (currentMode === 'move') {
                let clickedLine = findLineNear(coords.x, coords.y);
                if (clickedLine) {
                    selectLine(clickedLine);
                    isInteracting = true;
                    isPanningCanvas = false;
                    dragOffsetX = coords.x - clickedLine.x1;
                    dragOffsetY = coords.y - clickedLine.y1;
                } else {
                    // Boş bir alana dokunuldu: parça seçmek yerine tuvali kaydır
                    selectLine(null);
                    const screen = getScreenCoordinates(e);
                    isInteracting = true;
                    isPanningCanvas = true;
                    panLastX = screen.x;
                    panLastY = screen.y;
                    canvas.style.cursor = 'grabbing';
                }
            } else if (currentMode === 'group') {
                let clickedLine = findLineNear(coords.x, coords.y);
                if (clickedLine) {
                    groupPressLine = clickedLine;
                    groupIsDragging = false;
                    groupDragStartWorld = { x: coords.x, y: coords.y };
                    groupSnapshot = lines.filter(l => groupSelectedIds.has(l.id))
                        .map(l => ({ line: l, x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 }));
                    isInteracting = true;
                    isPanningCanvas = false;
                } else {
                    // Boş alana dokunuldu: grup modunda da kaydırma yapılabilsin
                    const screen = getScreenCoordinates(e);
                    isInteracting = true;
                    isPanningCanvas = true;
                    panLastX = screen.x;
                    panLastY = screen.y;
                    canvas.style.cursor = 'grabbing';
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

            if (isPanningCanvas) {
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

                // Uzaktaki parçalarla hizalanma durumunu (aynı satır/sütun) tam ekran kılavuz
                // çizgileriyle göster - mıknatıs menzili dışında kalsa bile fark edilsin diye.
                alignmentGuides = findAlignmentGuides(getProfileSnapPoints(selectedLine), selectedLine);

                redraw();
            }
            else if (currentMode === 'group' && groupPressLine) {
                let dx = coords.x - groupDragStartWorld.x;
                let dy = coords.y - groupDragStartWorld.y;

                if (!groupIsDragging && Math.hypot(dx, dy) > 5) {
                    groupIsDragging = true;
                    // Sürüklemeye başlanan parça henüz grupta değilse otomatik olarak gruba eklensin
                    if (!groupSelectedIds.has(groupPressLine.id)) {
                        groupSelectedIds.add(groupPressLine.id);
                        groupSnapshot.push({ line: groupPressLine, x1: groupPressLine.x1, y1: groupPressLine.y1, x2: groupPressLine.x2, y2: groupPressLine.y2 });
                    }
                }

                if (groupIsDragging) {
                    groupSnapshot.forEach(s => {
                        s.line.x1 = s.x1 + dx; s.line.y1 = s.y1 + dy;
                        s.line.x2 = s.x2 + dx; s.line.y2 = s.y2 + dy;
                    });
                    redraw();
                }
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
            alignmentGuides = [];

            if (isPanningCanvas) {
                isPanningCanvas = false;
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
                        cut2: 0,
                        cut1Side: 'top',
                        cut2Side: 'top'
                    };
                    lines.push(newLine);

                    // Parça çizildiği an otomatik olarak Seç/Taşı moduna geç ve sadece o parçayı seçili yap.
                    // Böylece bir sonraki parçayı çizmek için tekrar "Çiz" butonuna basman gerekiyor.
                    currentMode = 'move';
                    updateModeUI(btnMove);
                    selectLine(newLine);
                }
                autosave();
            } else if (currentMode === 'move') {
                autosave();
            } else if (currentMode === 'group' && groupPressLine) {
                if (!groupIsDragging) {
                    // Sadece dokunuldu (sürüklenmedi): grup üyeliğini aç/kapat
                    if (groupSelectedIds.has(groupPressLine.id)) groupSelectedIds.delete(groupPressLine.id);
                    else groupSelectedIds.add(groupPressLine.id);
                } else {
                    autosave();
                }
                groupPressLine = null;
                groupIsDragging = false;
            }
            redraw();
        }

        // Sürüklenen parçanın nokta setini, diğer parçaların noktalarıyla X/Y ekseninde
        // (mesafeden bağımsız) karşılaştırır; eşleşme varsa tam ekran kılavuz çizgisi döndürür.
        function findAlignmentGuides(movingPoints, excludeLine) {
            const tol = 4 / viewScale;
            let guides = [];
            let bestY = null, bestYDist = tol;
            let bestX = null, bestXDist = tol;
            lines.forEach(l => {
                if (l === excludeLine) return;
                getProfileSnapPoints(l).forEach(tp => {
                    movingPoints.forEach(mp => {
                        let dy = Math.abs(mp.y - tp.y);
                        if (dy < bestYDist) { bestYDist = dy; bestY = tp.y; }
                        let dx = Math.abs(mp.x - tp.x);
                        if (dx < bestXDist) { bestXDist = dx; bestX = tp.x; }
                    });
                });
            });
            if (bestY !== null) guides.push({ type: 'y', value: bestY });
            if (bestX !== null) guides.push({ type: 'x', value: bestX });
            return guides;
        }

        function selectLine(line) {
            selectedLine = line;
            if (line) {
                panel.classList.add('panel-visible');
                // Mobilde panel ekranı kaplamasın diye varsayılan olarak küçültülmüş açılır
                if (window.matchMedia('(max-width: 640px)').matches) {
                    panel.classList.add('collapsed');
                } else {
                    panel.classList.remove('collapsed');
                }
                updateToggleIcon();
                updatePanelValues();
            } else {
                panel.classList.remove('panel-visible');
            }
            redraw();
        }

        function updateToggleIcon() {
            const btn = document.getElementById('btn-toggle-panel');
            if (btn) btn.textContent = panel.classList.contains('collapsed') ? '▾' : '▲';
        }

        function toggleCollapse() {
            panel.classList.toggle('collapsed');
            updateToggleIcon();
        }

        document.getElementById('btn-toggle-panel').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollapse();
        });

        // Mobilde küçük oka basmak yerine tüm başlık şeridine dokunarak da aç/kapat yapılabilsin
        document.getElementById('panel-header').addEventListener('click', toggleCollapse);
        document.getElementById('btn-duplicate').addEventListener('click', (e) => e.stopPropagation());

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
            inputName.value = selectedLine.name || '';

            const titleEl = document.getElementById('panel-title');
            if (titleEl) titleEl.textContent = (selectedLine.name ? selectedLine.name + ' · ' : `Parça #${selectedLine.id} · `) + `${lengthCm.toFixed(1)}cm`;

            // Üst/Alt köşe referans butonlarının etiketini güncel duruma göre göster
            const side1 = selectedLine.cut1Side || 'top';
            const side2 = selectedLine.cut2Side || 'top';
            const flipBtn1 = document.getElementById('btn-flip-cut1');
            const flipBtn2 = document.getElementById('btn-flip-cut2');
            if (flipBtn1) flipBtn1.textContent = side1 === 'top' ? '⬆Üst' : '⬇Alt';
            if (flipBtn2) flipBtn2.textContent = side2 === 'top' ? '⬆Üst' : '⬇Alt';

            // Her iki ucun bağımsız üst/alt referansına göre GERÇEK üst ve alt kenar uzunluklarını hesapla.
            // (Kalınlık cm->px çevrimi burada doğru yapılıyor; önceki sürümde birim karışıklığı vardı.)
            const edgeInfoEl = document.getElementById('edge-info');
            if (edgeInfoEl) {
                const tPx = (selectedLine.thicknessCm || 4) * PX_PER_CM;
                const c1 = (selectedLine.cut1 || 0) * Math.PI / 180;
                const c2 = (selectedLine.cut2 || 0) * Math.PI / 180;
                const full1 = tPx * Math.tan(c1);
                const full2 = tPx * Math.tan(c2);

                const TLx = side1 === 'top' ? 0 : full1;
                const BLx = side1 === 'top' ? full1 : 0;
                const TRx = side2 === 'top' ? lengthPx : lengthPx - full2;
                const BRx = side2 === 'top' ? lengthPx - full2 : lengthPx;

                const topEdgeCm = (TRx - TLx) / PX_PER_CM;
                const botEdgeCm = (BRx - BLx) / PX_PER_CM;

                if (selectedLine.cut1 || selectedLine.cut2) {
                    edgeInfoEl.innerHTML = `<b>Üst kenar:</b> ${topEdgeCm.toFixed(1)}cm &nbsp;|&nbsp; <b>Alt kenar:</b> ${botEdgeCm.toFixed(1)}cm`;
                } else {
                    edgeInfoEl.innerHTML = '';
                }
            }
        }

        function applyPanelChanges() {
            if (!selectedLine) return;

            let newLengthPx = parseFloat(inputLength.value) * PX_PER_CM;
            let newAngle = parseFloat(inputAngle.value) * (Math.PI / 180);

            selectedLine.x2 = selectedLine.x1 + newLengthPx * Math.cos(newAngle);
            selectedLine.y2 = selectedLine.y1 + newLengthPx * Math.sin(newAngle);

            selectedLine.thicknessCm = parseFloat(inputThickness.value) || 0;
            selectedLine.cut1 = parseFloat(inputCut1.value) || 0;
            selectedLine.cut2 = parseFloat(inputCut2.value) || 0;
            selectedLine.name = (inputName.value || '').trim();

            updatePanelValues();
            autosave();
            redraw();

            // Uygulayınca panel küçülsün, parça net görünsün
            panel.classList.add('collapsed');
            updateToggleIcon();
        }
        document.getElementById('btn-apply').addEventListener('click', applyPanelChanges);

        // Bu uçta hangi köşenin sabit/uzun (eksen ölçüsü kadar) kalacağını değiştirir.
        // Diyagonal parçalarda bir uç üstten, diğer uç alttan referans alınabilmeli.
        document.getElementById('btn-flip-cut1').addEventListener('click', () => {
            if (!selectedLine) return;
            selectedLine.cut1Side = (selectedLine.cut1Side === 'bottom') ? 'top' : 'bottom';
            updatePanelValues();
            autosave();
            redraw();
        });
        document.getElementById('btn-flip-cut2').addEventListener('click', () => {
            if (!selectedLine) return;
            selectedLine.cut2Side = (selectedLine.cut2Side === 'bottom') ? 'top' : 'bottom';
            updatePanelValues();
            autosave();
            redraw();
        });

        document.getElementById('btn-duplicate').addEventListener('click', () => {
            if (!selectedLine) return;
            const offset = 30; // hafif kaydırılmış belirsin ki orijinalin tam üstüne binmesin
            const copy = {
                id: nextId++,
                x1: selectedLine.x1 + offset, y1: selectedLine.y1 + offset,
                x2: selectedLine.x2 + offset, y2: selectedLine.y2 + offset,
                thicknessCm: selectedLine.thicknessCm,
                cut1: selectedLine.cut1,
                cut2: selectedLine.cut2,
                cut1Side: selectedLine.cut1Side || 'top',
                cut2Side: selectedLine.cut2Side || 'top',
                name: selectedLine.name || ''
            };
            lines.push(copy);
            // Kopya otomatik olarak taşıma modunda seçili gelir; sadece sürükleyip yerine koyman yeterli
            currentMode = 'move';
            updateModeUI(btnMove);
            selectLine(copy);
            autosave();
        });

        function deleteSelectedLine() {
            if (!selectedLine) return;
            lines = lines.filter(l => l !== selectedLine);
            selectLine(null);
            autosave();
        }

        document.getElementById('btn-delete').addEventListener('click', deleteSelectedLine);
        document.getElementById('btn-delete-toolbar').addEventListener('click', deleteSelectedLine);

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
        function drawProfile(line, isSelected, isGrouped) {
            let dx = line.x2 - line.x1;
            let dy = line.y2 - line.y1;
            let length = Math.hypot(dx, dy);
            let angle = Math.atan2(dy, dx);

            // Kalınlığı piksele çevir
            let t = (line.thicknessCm || 4) * PX_PER_CM;

            // Açıları (0 düz kesimdir) radyana çevir
            let c1 = (line.cut1 || 0) * Math.PI / 180;
            let c2 = (line.cut2 || 0) * Math.PI / 180;

            // Kesim açılarına göre HER UÇ bağımsız olarak üst veya alt köşesini referans
            // (sabit/uzun nokta) alabilir; diğer köşe içeri doğru kesilir.
            let full1 = t * Math.tan(c1);
            let full2 = t * Math.tan(c2);
            const side1 = line.cut1Side || 'top';
            const side2 = line.cut2Side || 'top';
            let TLx = side1 === 'top' ? 0 : full1;
            let BLx = side1 === 'top' ? full1 : 0;
            let TRx = side2 === 'top' ? length : length - full2;
            let BRx = side2 === 'top' ? length - full2 : length;

            ctx.save();
            ctx.translate(line.x1, line.y1); // Başlangıç noktasına git
            ctx.rotate(angle); // Çizginin eğimine göre tuvali döndür

            // Geometrik Parçayı (Poligon) Çiz
            ctx.beginPath();
            ctx.moveTo(TLx, -t/2); // Sol Üst Köşe
            ctx.lineTo(TRx, -t/2); // Sağ Üst Köşe
            ctx.lineTo(BRx, t/2); // Sağ Alt Köşe
            ctx.lineTo(BLx, t/2); // Sol Alt Köşe
            ctx.closePath();

            // Parça Renkleri: seçili = kırmızı, grup üyesi = mavi, normal = özelleştirilebilir renk
            if (isSelected) {
                ctx.fillStyle = 'rgba(239, 35, 60, 0.3)';
                ctx.strokeStyle = '#d90429';
            } else if (isGrouped) {
                ctx.fillStyle = 'rgba(67, 97, 238, 0.35)';
                ctx.strokeStyle = '#4361ee';
            } else {
                ctx.fillStyle = hexToRgba(pieceColor, 0.5);
                ctx.strokeStyle = '#2b2d42';
            }
            ctx.fill();
            ctx.lineWidth = 2 / viewScale;
            ctx.stroke();

            // Tam Merkezden Geçen Aks (Eksen) Çizgisi
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(length, 0);
            ctx.strokeStyle = isSelected ? '#ef233c' : (isGrouped ? '#1d3557' : '#ffffff');
            ctx.lineWidth = 1 / viewScale;
            ctx.setLineDash([5 / viewScale, 5 / viewScale]); // Kesik çizgi efekti
            ctx.stroke();
            ctx.setLineDash([]); // Normale döndür

            ctx.restore();
        }

        function drawGrid() {
            ctx.strokeStyle = gridColor;
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
        function drawLabels(forceDetails) {
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

                let mainText = `${line.name ? line.name : '#' + line.id} · ${lengthCm.toFixed(1)}cm`;
                ctx.font = '11px Segoe UI, sans-serif';
                const padding = 5;
                const w = ctx.measureText(mainText).width + padding * 2;
                ctx.fillStyle = isSel ? 'rgba(217,4,41,0.85)' : 'rgba(43,45,66,0.75)';
                ctx.fillRect(lx - w / 2, ly - 9, w, 18);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(mainText, lx, ly);

                if (isSel || forceDetails) {
                    let subParts = [];
                    if (line.name) subParts.push(`#${line.id}`);
                    subParts.push(`t:${line.thicknessCm || 4}cm`);
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
                listTotal.innerHTML = '';
                return;
            }

            let totalCm = 0;
            const byThickness = {};
            let rowsHtml = lines.map(line => {
                let dx = line.x2 - line.x1;
                let dy = line.y2 - line.y1;
                let lengthCm = Math.hypot(dx, dy) / PX_PER_CM;
                totalCm += lengthCm;
                const t = line.thicknessCm || 4;
                byThickness[t] = (byThickness[t] || 0) + lengthCm;
                const isSel = line === selectedLine;
                const label = line.name ? `${line.name} (#${line.id})` : `#${line.id}`;
                return `<div class="list-row${isSel ? ' list-row-active' : ''}" data-id="${line.id}">
                    <span class="list-row-info">
                        <span class="list-row-main">${label} — ${lengthCm.toFixed(1)}cm (t:${t})</span>
                        <span class="list-row-sub">Açılar: ${line.cut1 || 0}° / ${line.cut2 || 0}°</span>
                    </span>
                    <span class="list-del" data-id="${line.id}">×</span>
                </div>`;
            }).join('');

            listContent.innerHTML = rowsHtml;

            const breakdownHtml = Object.keys(byThickness).sort((a, b) => a - b).map(t =>
                `<div style="display:flex; justify-content:space-between; color:#6b7280;">
                    <span>t:${t}cm toplam</span><span>${byThickness[t].toFixed(1)}cm</span>
                </div>`
            ).join('');
            listTotal.innerHTML = `${breakdownHtml}
                <div style="margin-top:5px; padding-top:5px; border-top:1px solid #c3cbdb; font-weight:bold;">
                    Genel Toplam: ${lines.length} parça, ${totalCm.toFixed(1)} cm (${(totalCm / 100).toFixed(2)} m)
                </div>`;

            listContent.querySelectorAll('.list-del').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(el.getAttribute('data-id'));
                    const wasSelected = selectedLine && selectedLine.id === id;
                    lines = lines.filter(l => l.id !== id);
                    if (wasSelected) selectLine(null); else redraw();
                    autosave();
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

        // ===== MENÜ: KAYDET / YÜKLE / PNG / RENKLER =====
        document.getElementById('btn-menu').addEventListener('click', (e) => {
            const mp = document.getElementById('menu-panel');
            const isOpen = mp.style.display === 'flex';
            mp.style.display = isOpen ? 'none' : 'flex';
            e.currentTarget.classList.toggle('active', !isOpen);
        });

        // Renk seçicileri kaydedilmiş temayla eşitle
        const colorBgInput = document.getElementById('color-bg');
        const colorGridInput = document.getElementById('color-grid');
        const colorPieceInput = document.getElementById('color-piece');
        colorBgInput.value = canvasBgColor;
        colorGridInput.value = gridColor;
        colorPieceInput.value = pieceColor;

        colorBgInput.addEventListener('input', () => { canvasBgColor = colorBgInput.value; saveTheme(); redraw(); });
        colorGridInput.addEventListener('input', () => { gridColor = colorGridInput.value; saveTheme(); redraw(); });
        colorPieceInput.addEventListener('input', () => { pieceColor = colorPieceInput.value; saveTheme(); redraw(); });

        document.getElementById('btn-reset-colors').addEventListener('click', () => {
            canvasBgColor = '#ffffff';
            gridColor = '#eef0f2';
            pieceColor = '#8d99ae';
            colorBgInput.value = canvasBgColor;
            colorGridInput.value = gridColor;
            colorPieceInput.value = pieceColor;
            saveTheme();
            redraw();
        });

        function exportJSON() {
            if (lines.length === 0) { alert('Dışa aktarılacak parça yok.'); return; }
            const data = { version: 1, nextId, lines };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'iskelet-cizim.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        document.getElementById('btn-export-json').addEventListener('click', exportJSON);

        document.getElementById('btn-import-json').addEventListener('click', () => {
            document.getElementById('file-import-input').click();
        });

        document.getElementById('file-import-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data && Array.isArray(data.lines)) {
                        if (lines.length > 0 && !confirm('Mevcut çizim silinip yüklenen dosyayla değiştirilecek. Devam edilsin mi?')) {
                            return;
                        }
                        lines = data.lines;
                        nextId = data.nextId || (lines.reduce((m, l) => Math.max(m, l.id || 0), 0) + 1);
                        selectLine(null);
                        autosave();
                    } else {
                        alert('Geçersiz dosya formatı.');
                    }
                } catch (err) {
                    alert('Dosya okunamadı: ' + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // aynı dosyayı tekrar seçebilmek için sıfırla
        });

        // Tüm çizimi (kalınlık/açı etiketleriyle) beyaz zeminli, sınırlara sığdırılmış bir
        // offscreen tuvale render edip {dataUrl, w, h} döndürür. PNG ve PDF dışa aktarma bunu paylaşır.
        function renderDrawingToDataURL() {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            lines.forEach(l => {
                getProfileSnapPoints(l).forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
            });
            const pad = 60;
            const w = Math.ceil((maxX - minX) + pad * 2);
            const h = Math.ceil((maxY - minY) + pad * 2);

            const origCtx = ctx, origScale = viewScale, origVX = viewX, origVY = viewY;
            const origSelected = selectedLine, origNearby = nearbySnapPoints, origActive = activeSnapPoint;
            const origGuides = alignmentGuides;

            const off = document.createElement('canvas');
            off.width = w;
            off.height = h;
            const octx = off.getContext('2d');
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, w, h);

            ctx = octx;
            viewScale = 1;
            viewX = pad - minX;
            viewY = pad - minY;
            selectedLine = null;
            nearbySnapPoints = [];
            activeSnapPoint = null;
            alignmentGuides = [];

            drawWorld(() => {
                lines.forEach(line => drawProfile(line, false, false));
            });
            drawLabels(true);

            const dataUrl = off.toDataURL('image/png');

            ctx = origCtx;
            viewScale = origScale;
            viewX = origVX;
            viewY = origVY;
            selectedLine = origSelected;
            nearbySnapPoints = origNearby;
            activeSnapPoint = origActive;
            alignmentGuides = origGuides;
            redraw();

            return { dataUrl, w, h };
        }

        function triggerDownload(href, filename) {
            const a = document.createElement('a');
            a.href = href;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        function exportPNG() {
            if (lines.length === 0) { alert('Dışa aktarılacak parça yok.'); return; }
            const { dataUrl } = renderDrawingToDataURL();
            triggerDownload(dataUrl, 'iskelet-cizim.png');
        }
        document.getElementById('btn-export-png').addEventListener('click', exportPNG);

        function getJsPDF() {
            if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
            alert('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.');
            return null;
        }

        function exportPdfDrawing() {
            if (lines.length === 0) { alert('Dışa aktarılacak parça yok.'); return; }
            const JsPDFCtor = getJsPDF();
            if (!JsPDFCtor) return;

            const { dataUrl, w, h } = renderDrawingToDataURL();
            const orientation = w >= h ? 'landscape' : 'portrait';
            const doc = new JsPDFCtor({ orientation, unit: 'pt', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 24;
            const availW = pageW - margin * 2;
            const availH = pageH - margin * 2;
            const scale = Math.min(availW / w, availH / h);
            const imgW = w * scale;
            const imgH = h * scale;
            const x = (pageW - imgW) / 2;
            const y = (pageH - imgH) / 2;

            doc.setFontSize(11);
            doc.text('İmalat / İskelet Çizimi', margin, margin - 6);
            doc.addImage(dataUrl, 'PNG', x, y, imgW, imgH);
            doc.save('iskelet-cizim.pdf');
        }
        document.getElementById('btn-export-pdf-drawing').addEventListener('click', exportPdfDrawing);

        function exportPdfList() {
            if (lines.length === 0) { alert('Dışa aktarılacak parça yok.'); return; }
            const JsPDFCtor = getJsPDF();
            if (!JsPDFCtor) return;

            const doc = new JsPDFCtor({ unit: 'pt', format: 'a4' });
            const margin = 40;
            let y = margin;

            doc.setFontSize(15);
            doc.text('Malzeme Listesi', margin, y);
            y += 22;
            doc.setFontSize(10);
            doc.setTextColor(120);
            doc.text(new Date().toLocaleString('tr-TR'), margin, y);
            doc.setTextColor(20);
            y += 20;

            doc.setFontSize(11);
            let totalCm = 0;
            const byThickness = {};

            lines.forEach(line => {
                let dx = line.x2 - line.x1, dy = line.y2 - line.y1;
                let lengthCm = Math.hypot(dx, dy) / PX_PER_CM;
                totalCm += lengthCm;
                const t = line.thicknessCm || 4;
                byThickness[t] = (byThickness[t] || 0) + lengthCm;

                const label = line.name ? `${line.name} (#${line.id})` : `#${line.id}`;
                const row = `${label}  —  ${lengthCm.toFixed(1)}cm, kalınlık: ${t}cm, açılar: ${line.cut1 || 0}°/${line.cut2 || 0}°`;

                if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
                doc.text(row, margin, y);
                y += 16;
            });

            y += 10;
            if (y > doc.internal.pageSize.getHeight() - margin - 60) { doc.addPage(); y = margin; }
            doc.setDrawColor(200);
            doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
            y += 18;

            doc.setFontSize(11);
            Object.keys(byThickness).sort((a, b) => a - b).forEach(t => {
                doc.text(`Kalınlık t:${t}cm toplam: ${byThickness[t].toFixed(1)}cm`, margin, y);
                y += 16;
            });

            y += 6;
            doc.setFontSize(12);
            doc.text(`Genel Toplam: ${lines.length} parça, ${totalCm.toFixed(1)}cm (${(totalCm / 100).toFixed(2)}m)`, margin, y);

            doc.save('malzeme-listesi.pdf');
        }
        document.getElementById('btn-export-pdf-list').addEventListener('click', exportPdfList);

        function copyListToClipboard() {
            if (lines.length === 0) { alert('Kopyalanacak parça yok.'); return; }
            let totalCm = 0;
            let textLines = lines.map(line => {
                let dx = line.x2 - line.x1, dy = line.y2 - line.y1;
                let lengthCm = Math.hypot(dx, dy) / PX_PER_CM;
                totalCm += lengthCm;
                const label = line.name ? `${line.name} (#${line.id})` : `#${line.id}`;
                return `${label}: ${lengthCm.toFixed(1)}cm, kalınlık:${line.thicknessCm || 4}cm, açılar:${line.cut1 || 0}°/${line.cut2 || 0}°`;
            });
            textLines.push('');
            textLines.push(`Toplam: ${lines.length} parça, ${totalCm.toFixed(1)}cm (${(totalCm / 100).toFixed(2)}m)`);
            const text = textLines.join('\n');

            const btn = document.getElementById('btn-copy-list');
            const showFeedback = (msg) => {
                if (!btn) return;
                const original = btn.textContent;
                btn.textContent = msg;
                setTimeout(() => { btn.textContent = original; }, 1500);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showFeedback('✓')).catch(() => alert('Kopyalanamadı, tarayıcı izin vermedi.'));
            } else {
                // Eski tarayıcı yedek yöntemi
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); showFeedback('✓'); } catch (err) { alert('Kopyalanamadı.'); }
                document.body.removeChild(ta);
            }
        }
        document.getElementById('btn-copy-list').addEventListener('click', copyListToClipboard);

        function redraw() {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = canvasBgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            drawWorld(() => {
                drawGrid();
                lines.forEach(line => drawProfile(line, line === selectedLine, groupSelectedIds.has(line.id)));
                drawSnapPreview();
                drawSnapIndicator();
            });

            drawAlignmentGuides();
            drawLabels();
            updateZoomIndicator();
            renderListPanel();
        }

        // Hizalama kılavuz çizgilerini tam ekran (dünya dönüşümünden bağımsız) çizer
        function drawAlignmentGuides() {
            if (!alignmentGuides.length) return;
            ctx.save();
            ctx.strokeStyle = '#ff006e';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 5]);
            alignmentGuides.forEach(g => {
                ctx.beginPath();
                if (g.type === 'y') {
                    const sy = viewY + g.value * viewScale;
                    ctx.moveTo(0, sy);
                    ctx.lineTo(canvas.width, sy);
                } else {
                    const sx = viewX + g.value * viewScale;
                    ctx.moveTo(sx, 0);
                    ctx.lineTo(sx, canvas.height);
                }
                ctx.stroke();
            });
            ctx.setLineDash([]);
            ctx.restore();
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

        function clearAll() {
            if (confirm("Tüm çizimi temizlemek istediğinize emin misiniz?")) {
                lines = [];
                selectLine(null);
                autosave();
            }
        }
        document.getElementById('btn-clear').addEventListener('click', clearAll);

        function undoLast() {
            lines.pop();
            selectLine(null);
            autosave();
        }
        document.getElementById('btn-undo').addEventListener('click', undoLast);

        // ===== HASSAS KAYDIRMA (yukarı/aşağı/sol/sağ, tam cm ölçüsüyle) =====
        function nudgeSelected(dxCm, dyCm) {
            if (!selectedLine) return;
            const dx = dxCm * PX_PER_CM, dy = dyCm * PX_PER_CM;
            selectedLine.x1 += dx; selectedLine.y1 += dy;
            selectedLine.x2 += dx; selectedLine.y2 += dy;
            redraw();
            autosave();
        }
        function getNudgeAmount() {
            return parseFloat(document.getElementById('nudge-amount').value) || 1;
        }
        document.getElementById('nudge-up').addEventListener('click', () => nudgeSelected(0, -getNudgeAmount()));
        document.getElementById('nudge-down').addEventListener('click', () => nudgeSelected(0, getNudgeAmount()));
        document.getElementById('nudge-left').addEventListener('click', () => nudgeSelected(-getNudgeAmount(), 0));
        document.getElementById('nudge-right').addEventListener('click', () => nudgeSelected(getNudgeAmount(), 0));

        // ===== KLAVYE KISAYOLLARI (masaüstü) =====
        document.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return; // bir alana yazarken kısayolları tetikleme

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLine) {
                e.preventDefault();
                deleteSelectedLine();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undoLast();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                if (selectedLine) document.getElementById('btn-duplicate').click();
            } else if (selectedLine && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const amt = e.shiftKey ? getNudgeAmount() * 5 : getNudgeAmount();
                if (e.key === 'ArrowUp') nudgeSelected(0, -amt);
                else if (e.key === 'ArrowDown') nudgeSelected(0, amt);
                else if (e.key === 'ArrowLeft') nudgeSelected(-amt, 0);
                else if (e.key === 'ArrowRight') nudgeSelected(amt, 0);
            }
        });