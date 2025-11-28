document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('pathCanvas');
    const ctx = canvas.getContext('2d');
    const pathInput = document.getElementById('pathInput');
    const applyPathsButton = document.getElementById('applyPathsButton');
    const showPointNumbersCheckbox = document.getElementById('showPointNumbers');
    const loadedPathsList = document.getElementById('loadedPathsList');

    // Set initial canvas size
    canvas.width = window.innerWidth * 0.7; // Canvas takes 70% of width now
    canvas.height = window.innerHeight * 0.9;

    // Coordinate system settings (initial values, will be updated)
    const axisColor = '#888';
    const axisThickness = 1;
    const minTickSpacing = 50;
    const tickLength = 5;
    const labelOffset = 15;
    let originX = canvas.width / 2;
    let originY = canvas.height / 2;
    let scale = 20; // Initial pixels per unit, will be auto-adjusted

    // Store all paths to be drawn
    // Each item: { id: string, path: Array<{x, y}>, color: string, thickness: number, visible: boolean }
    const loadedPathData = [];
    let nextPathId = 0; // For unique IDs

    // Predefined colors for paths
    const colors = ['blue', 'red', 'green', 'purple', 'orange', 'darkcyan', 'magenta', 'brown'];
    let colorIndex = 0;

    /**
     * Helper to get a consistent random color (or cycle through predefined)
     */
    function getNextColor() {
        const color = colors[colorIndex % colors.length];
        colorIndex++;
        return color;
    }

    /**
     * Parses path data from the textarea and updates loadedPathData.
     */
    function parseAndLoadPaths() {
        const lines = eval(pathInput.value);

        loadedPathData.length = 0; // Clear existing paths
        colorIndex = 0; // Reset color cycle

        lines.forEach((path, lineIndex) => {
            try {
                // Basic validation for path format
                if (Array.isArray(path) && path.every(p => typeof p.x === 'number' && typeof p.y === 'number')) {
                    loadedPathData.push({
                        id: `path-${nextPathId++}`,
                        path: path,
                        color: getNextColor(),
                        thickness: 3, // Default thickness
                        visible: true // Default to visible
                    });
                } else {
                    console.warn(`Line ${lineIndex + 1}: Invalid path format. Skipping.`, line);
                }
            } catch (e) {
                console.error(`Line ${lineIndex + 1}: JSON parse error. Skipping.`, e);
            }
        });
        updateLoadedPathsList();
        render(); // Re-render canvas with new paths
    }

    /**
     * Updates the HTML list of loaded paths.
     */
    function updateLoadedPathsList() {
        loadedPathsList.innerHTML = ''; // Clear previous list items

        loadedPathData.forEach(pathItem => {
            const li = document.createElement('li');
            li.innerHTML = `
                <label class="path-label">
                    <input type="checkbox" class="path-visibility-checkbox" data-path-id="${pathItem.id}" ${pathItem.visible ? 'checked' : ''}>
                    路径 ${pathItem.id.split('-')[1]}
                    <div class="color-box" style="background-color: ${pathItem.color};"></div>
                </label>
            `;
            loadedPathsList.appendChild(li);
        });

        // Add event listeners for new checkboxes
        loadedPathsList.querySelectorAll('.path-visibility-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const pathId = event.target.dataset.pathId;
                const isVisible = event.target.checked;
                const item = loadedPathData.find(p => p.id === pathId);
                if (item) {
                    item.visible = isVisible;
                    render(); // Re-render when visibility changes
                }
            });
        });
    }

    /**
     * Calculates the bounding box of all VISIBLE paths.
     * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
     */
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

    /**
     * Automatically adjusts scale and origin based on paths' bounding box.
     */
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

    /**
     * Calculates an appropriate tick interval for the given scale.
     */
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

    /**
     * Helper to determine number of decimal places for a given number.
     */
    function getPrecision(num) {
        if (num === 0) return 0;
        const s = num.toString();
        const e = s.indexOf('e-');
        if (e !== -1) return parseInt(s.slice(e + 2));
        const parts = s.split('.');
        return parts.length > 1 ? parts[1].length : 0;
    }

    // Function to draw the coordinate system
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

        // Draw X-axis ticks and labels
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

        // Draw Y-axis ticks and labels
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

        // Draw origin label
        ctx.fillText('0', originX - labelOffset, originY + labelOffset);
    }

    /**
     * Draws a path on the canvas and optionally point numbers.
     */
    function drawPath(path, color, thickness, showNumbers) {
        if (path.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineJoin = 'round';
        ctx.moveTo(originX + path[0].x * scale, originY - path[0].y * scale);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(originX + path[i].x * scale, originY - path[i].y * scale);
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

    // Function to draw everything
    function render() {
        autoScaleAndPan();
        drawCoordinateSystem();

        const showNumbers = showPointNumbersCheckbox.checked;

        loadedPathData.forEach(pathItem => {
            if (pathItem.visible) {
                drawPath(pathItem.path, pathItem.color, pathItem.thickness, showNumbers);
            }
        });
    }

    // Initial paths for demonstration (can be edited in the textarea)
    pathInput.value = `[[{x:10,y:10},{x:20,y:30}],
[{x:-5,y:0},{x:5,y:-5}]]`;

    // Event Listeners
    applyPathsButton.addEventListener('click', parseAndLoadPaths);
    showPointNumbersCheckbox.addEventListener('change', render);
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth * 0.7; // Keep sidebar width
        canvas.height = window.innerHeight * 0.9;
        render();
    });

    // Initial rendering after DOM load and example paths are set
    parseAndLoadPaths(); // Load initial paths from textarea
});