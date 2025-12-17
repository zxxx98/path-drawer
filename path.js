document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('pathCanvas');
    const ctx = canvas.getContext('2d');
    const pathInput = document.getElementById('pathInput');
    const applyPathsButton = document.getElementById('applyPathsButton');
    const showPointNumbersCheckbox = document.getElementById('showPointNumbers');
    const loadedPathsList = document.getElementById('loadedPathsList');

    // Set initial canvas size
    canvas.width = window.innerWidth * 0.7; 
    canvas.height = window.innerHeight * 0.9;

    // Coordinate system settings
    const axisColor = '#888';
    const axisThickness = 1;
    const minTickSpacing = 50;
    const tickLength = 5;
    const labelOffset = 15;
    let originX = canvas.width / 2;
    let originY = canvas.height / 2;
    let scale = 20; 

    // Store all paths to be drawn
    // Each item: { id, path, color, thickness, visible, closed }
    const loadedPathData = [];
    let nextPathId = 0; 

    const colors = ['blue', 'red', 'green', 'purple', 'orange', 'darkcyan', 'magenta', 'brown'];
    let colorIndex = 0;

    function getNextColor() {
        const color = colors[colorIndex % colors.length];
        colorIndex++;
        return color;
    }

    /**
     * Parses path data from the textarea and updates loadedPathData.
     */
    function parseAndLoadPaths() {
        // Note: Using eval can be unsafe in production, handled here as per original code
        let lines;
        try {
            lines = eval(pathInput.value);
        } catch (e) {
            console.error("Input parse error", e);
            return;
        }

        loadedPathData.length = 0; 
        colorIndex = 0; 

        lines.forEach((path, lineIndex) => {
            try {
                if (Array.isArray(path) && path.every(p => typeof p.x === 'number' && typeof p.y === 'number')) {
                    loadedPathData.push({
                        id: `path-${nextPathId++}`,
                        path: path,
                        color: getNextColor(),
                        thickness: 3, 
                        visible: true,
                        closed: false // NEW: Initialize closed property to false
                    });
                } else {
                    console.warn(`Line ${lineIndex + 1}: Invalid path format.`);
                }
            } catch (e) {
                console.error(`Line ${lineIndex + 1}: JSON parse error.`, e);
            }
        });
        updateLoadedPathsList();
        render(); 
    }

    /**
     * Updates the HTML list of loaded paths.
     */
    function updateLoadedPathsList() {
        loadedPathsList.innerHTML = ''; 

        loadedPathData.forEach(pathItem => {
            const li = document.createElement('li');
            // MODIFIED: Updated HTML structure to include the "Closed" checkbox
            li.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label class="path-label" style="cursor: pointer;">
                        <input type="checkbox" class="path-visibility-checkbox" data-path-id="${pathItem.id}" ${pathItem.visible ? 'checked' : ''}>
                        路径 ${pathItem.id.split('-')[1]}
                    </label>
                    <div class="color-box" style="background-color: ${pathItem.color}; width: 12px; height: 12px; display:inline-block;"></div>
                    
                    <label style="font-size: 0.9em; margin-left: 10px; cursor: pointer; display: flex; align-items: center;">
                        <input type="checkbox" class="path-closed-checkbox" data-path-id="${pathItem.id}" ${pathItem.closed ? 'checked' : ''}>
                        <span style="margin-left: 4px;">闭合</span>
                    </label>
                </div>
            `;
            loadedPathsList.appendChild(li);
        });

        // Event listeners for Visibility checkboxes
        loadedPathsList.querySelectorAll('.path-visibility-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const pathId = event.target.dataset.pathId;
                const item = loadedPathData.find(p => p.id === pathId);
                if (item) {
                    item.visible = event.target.checked;
                    render();
                }
            });
        });

        // NEW: Event listeners for Closed checkboxes
        loadedPathsList.querySelectorAll('.path-closed-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const pathId = event.target.dataset.pathId;
                const item = loadedPathData.find(p => p.id === pathId);
                if (item) {
                    item.closed = event.target.checked; // Update data model
                    render(); // Re-render
                }
            });
        });
    }

    function calculatePathsBoundingBox() {
        const visiblePaths = loadedPathData.filter(item => item.visible);
        if (visiblePaths.length === 0) {
            return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        visiblePaths.forEach(pathData => {
            pathData.path.forEach(point => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        });

        if (minX === maxX) { minX -= 1; maxX += 1; }
        if (minY === maxY) { minY -= 1; maxY += 1; }

        const padding = 0.1;
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        minX -= rangeX * padding;
        maxX += rangeX * padding;
        minY -= rangeY * padding;
        maxY += rangeY * padding;

        return { minX, maxX, minY, maxY };
    }

    function autoScaleAndPan() {
        const bbox = calculatePathsBoundingBox();
        const { minX, maxX, minY, maxY } = bbox;

        const dataWidth = maxX - minX;
        const dataHeight = maxY - minY;

        const canvasPadding = 0.1;
        const effectiveCanvasWidth = canvas.width * (1 - canvasPadding * 2);
        const effectiveCanvasHeight = canvas.height * (1 - canvasPadding * 2);

        let scaleX = dataWidth > 0 ? effectiveCanvasWidth / dataWidth : 1;
        let scaleY = dataHeight > 0 ? effectiveCanvasHeight / dataHeight : 1;

        scale = Math.min(scaleX, scaleY);

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        originX = canvas.width / 2 - centerX * scale;
        originY = canvas.height / 2 + centerY * scale;
    }

    function getNiceTickInterval(currentScale, minPixelSpacing) {
        const approxTickCount = Math.floor(canvas.width / minPixelSpacing);
        if (approxTickCount === 0) return 1;

        const range = canvas.width / currentScale;
        let roughInterval = range / approxTickCount;

        const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

        for (let i = 0; i < niceSteps.length; i++) {
            if (niceSteps[i] >= roughInterval) {
                return niceSteps[i];
            }
        }
        return niceSteps[niceSteps.length - 1];
    }

    function getPrecision(num) {
        if (num === 0) return 0;
        const s = num.toString();
        const e = s.indexOf('e-');
        if (e !== -1) return parseInt(s.slice(e + 2));
        const parts = s.split('.');
        return parts.length > 1 ? parts[1].length : 0;
    }

    function drawCoordinateSystem() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = axisThickness;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#333';

        // Draw X-axis
        ctx.beginPath();
        ctx.moveTo(0, originY);
        ctx.lineTo(canvas.width, originY);
        ctx.stroke();

        // Draw Y-axis
        ctx.beginPath();
        ctx.moveTo(originX, 0);
        ctx.lineTo(originX, canvas.height);
        ctx.stroke();

        const tickInterval = getNiceTickInterval(scale, minTickSpacing);

        // X-axis ticks
        const startXUnit = Math.floor((-originX / scale) / tickInterval) * tickInterval;
        const endXUnit = Math.ceil(((canvas.width - originX) / scale) / tickInterval) * tickInterval;

        for (let i = startXUnit; i <= endXUnit; i += tickInterval) {
            if (i === 0) continue;
            const x = originX + i * scale;
            if (x >= -labelOffset && x <= canvas.width + labelOffset) {
                ctx.beginPath();
                ctx.moveTo(x, originY - tickLength);
                ctx.lineTo(x, originY + tickLength);
                ctx.stroke();
                ctx.fillText(i.toFixed(getPrecision(tickInterval)), x, originY + labelOffset);
            }
        }

        // Y-axis ticks
        const startYUnit = Math.floor((-(canvas.height - originY) / scale) / tickInterval) * tickInterval;
        const endYUnit = Math.ceil((originY / scale) / tickInterval) * tickInterval;

        for (let i = startYUnit; i <= endYUnit; i += tickInterval) {
            if (i === 0) continue;
            const y = originY - i * scale;
            if (y >= -labelOffset && y <= canvas.height + labelOffset) {
                ctx.beginPath();
                ctx.moveTo(originX - tickLength, y);
                ctx.lineTo(originX + tickLength, y);
                ctx.stroke();
                ctx.fillText(i.toFixed(getPrecision(tickInterval)), originX - labelOffset, y);
            }
        }
        ctx.fillText('0', originX - labelOffset, originY + labelOffset);
    }

    /**
     * Draws a path on the canvas and optionally point numbers.
     * MODIFIED: Added isClosed parameter
     */
    function drawPath(path, color, thickness, showNumbers, isClosed) {
        if (path.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineJoin = 'round';
        ctx.moveTo(originX + path[0].x * scale, originY - path[0].y * scale);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(originX + path[i].x * scale, originY - path[i].y * scale);
        }

        // NEW: Close the path if requested
        if (isClosed) {
            ctx.closePath();
        }

        ctx.stroke();

        if (showNumbers) {
            ctx.fillStyle = color;
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            path.forEach((point, index) => {
                const px = originX + point.x * scale;
                const py = originY - point.y * scale;

                ctx.beginPath();
                ctx.arc(px, py, thickness / 2 + 1, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillText(index + 1, px, py - (thickness / 2 + 5));
            });
        }
    }

    function render() {
        autoScaleAndPan();
        drawCoordinateSystem();

        const showNumbers = showPointNumbersCheckbox.checked;

        loadedPathData.forEach(pathItem => {
            if (pathItem.visible) {
                // MODIFIED: Pass pathItem.closed to the draw function
                drawPath(pathItem.path, pathItem.color, pathItem.thickness, showNumbers, pathItem.closed);
            }
        });
    }

    pathInput.value = `[[{x:10,y:10},{x:20,y:30},{x:30,y:10}],
[{x:-5,y:0},{x:5,y:-5},{x:0,y:-10}]]`;

    applyPathsButton.addEventListener('click', parseAndLoadPaths);
    showPointNumbersCheckbox.addEventListener('change', render);
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth * 0.7; 
        canvas.height = window.innerHeight * 0.9;
        render();
    });

    parseAndLoadPaths();
});