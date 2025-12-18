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
    let hoveredPoint = null; // NEW: 存储当前鼠标悬停的点信息 { pathId, index, x, y }
    const infoBar = document.getElementById('infoBar'); // NEW: 获取信息栏元素
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

    /**
     * Helper to clamp a value within a range.
     * Used to keep labels visible on screen.
     */
    function clamp(val, min, max) {
        return Math.min(Math.max(val, min), max);
    }

    // Function to draw the coordinate system with Grid and Sticky Labels
    function drawCoordinateSystem() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const tickInterval = getNiceTickInterval(scale, minTickSpacing);
        const precision = getPrecision(tickInterval);

        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Grid styling
        const gridColor = '#e0e0e0'; // Light gray for normal grid
        const axisColor = '#666';    // Darker gray for main axes (0,0)
        const textColor = '#333';

        // 1. Calculate boundaries for drawing
        // We iterate based on what is currently visible on the screen
        const startXUnit = Math.floor((-originX / scale) / tickInterval) * tickInterval;
        const endXUnit = Math.ceil(((canvas.width - originX) / scale) / tickInterval) * tickInterval;

        const startYUnit = Math.floor((-(canvas.height - originY) / scale) / tickInterval) * tickInterval;
        const endYUnit = Math.ceil((originY / scale) / tickInterval) * tickInterval;

        // --- Draw Vertical Grid Lines (X values) ---
        for (let i = startXUnit; i <= endXUnit; i += tickInterval) {
            const x = originX + i * scale;
            
            // Skip drawing if strictly out of bounds (margin of error)
            if (x < -1 || x > canvas.width + 1) continue;

            const isMainAxis = (Math.abs(i) < tickInterval / 1000); // Check for x=0

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            
            if (isMainAxis) {
                ctx.strokeStyle = axisColor;
                ctx.lineWidth = 2; // Thicker for main axis
            } else {
                ctx.strokeStyle = gridColor;
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        }

        // --- Draw Horizontal Grid Lines (Y values) ---
        for (let i = startYUnit; i <= endYUnit; i += tickInterval) {
            const y = originY - i * scale;

            if (y < -1 || y > canvas.height + 1) continue;

            const isMainAxis = (Math.abs(i) < tickInterval / 1000); // Check for y=0

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);

            if (isMainAxis) {
                ctx.strokeStyle = axisColor;
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = gridColor;
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        }

        // --- Draw Labels (Sticky / Clamped) ---
        ctx.fillStyle = textColor;

        // Determine where to draw X-axis labels (control Y position)
        // Ideally at originY. If originY is off-screen, clamp it to bottom or top edge.
        // We add a padding (e.g., 15px) so it doesn't touch the very edge.
        let labelY = originY + labelOffset; 
        if (originY < 0) labelY = 15; // Axis is above, stick label to top
        if (originY > canvas.height) labelY = canvas.height - 15; // Axis is below, stick label to bottom
        
        // Draw X Labels
        for (let i = startXUnit; i <= endXUnit; i += tickInterval) {
            if (Math.abs(i) < tickInterval / 1000) continue; // Don't draw '0' yet, we do it separately or let corner handle it
            const x = originX + i * scale;
            if (x >= 0 && x <= canvas.width) {
                // Add a small background rect for legibility if overriding grid lines? 
                // For simplicity, just text:
                ctx.fillText(i.toFixed(precision), x, labelY);
            }
        }

        // Determine where to draw Y-axis labels (control X position)
        let labelX = originX - labelOffset;
        if (originX < 0) labelX = 15; // Axis is left, stick label to left
        if (originX > canvas.width) labelX = canvas.width - 25; // Axis is right, stick label to right

        // Draw Y Labels
        ctx.textAlign = (labelX < 30) ? 'left' : 'right'; // Adjust alignment based on side
        
        for (let i = startYUnit; i <= endYUnit; i += tickInterval) {
             if (Math.abs(i) < tickInterval / 1000) continue;
             const y = originY - i * scale;
             if (y >= 0 && y <= canvas.height) {
                 ctx.fillText(i.toFixed(precision), labelX, y);
             }
        }
        
        // Optionally draw '0' at the intersection of the clamped positions
        // ctx.fillText('0', labelX, labelY); 
    }

    /**
     * Draws a path on the canvas and optionally point numbers.
     * MODIFIED: Smart label positioning to avoid line overlap.
     */
    function drawPath(path, color, thickness, showNumbers, isClosed) {
        if (path.length < 2) return;

        // --- 1. Draw the Lines ---
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineJoin = 'round';
        ctx.moveTo(originX + path[0].x * scale, originY - path[0].y * scale);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(originX + path[i].x * scale, originY - path[i].y * scale);
        }
        if (isClosed) {
            ctx.closePath();
        }
        ctx.stroke();

        // --- 2. Draw Points and Smart Labels ---
        if (showNumbers) {
            ctx.fillStyle = color;
            ctx.font = '16px Arial'; // Slightly larger font
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Helper to get screen coordinates
            const getScreenPoint = (pt) => ({
                x: originX + pt.x * scale,
                y: originY - pt.y * scale
            });

            // Helper to normalize a vector
            const normalize = (v) => {
                const len = Math.sqrt(v.x * v.x + v.y * v.y);
                if (len === 0) return { x: 0, y: 0 };
                return { x: v.x / len, y: v.y / len };
            };

            path.forEach((point, index) => {
                const curr = getScreenPoint(point);

                // Draw the point circle
                ctx.beginPath();
                ctx.arc(curr.x, curr.y, thickness / 2 + 2, 0, Math.PI * 2);
                ctx.fill();

                // --- Calculate Smart Label Position ---
                
                let dir = { x: 0, y: -1 }; // Default direction (up)
                
                // Determine Previous and Next point indices
                let prevIdx = -1;
                let nextIdx = -1;

                if (isClosed) {
                    // Wrap around logic
                    prevIdx = (index - 1 + path.length) % path.length;
                    nextIdx = (index + 1) % path.length;
                } else {
                    // Standard boundaries
                    if (index > 0) prevIdx = index - 1;
                    if (index < path.length - 1) nextIdx = index + 1;
                }

                // Vector calculation
                let vPrev = { x: 0, y: 0 };
                let vNext = { x: 0, y: 0 };
                let hasPrev = false;
                let hasNext = false;

                if (prevIdx !== -1) {
                    const pPrev = getScreenPoint(path[prevIdx]);
                    vPrev = normalize({ x: pPrev.x - curr.x, y: pPrev.y - curr.y });
                    hasPrev = true;
                }

                if (nextIdx !== -1) {
                    const pNext = getScreenPoint(path[nextIdx]);
                    vNext = normalize({ x: pNext.x - curr.x, y: pNext.y - curr.y });
                    hasNext = true;
                }

                if (hasPrev && hasNext) {
                    // Middle point (or closed path endpoint): Calculate angle bisector
                    // Summing unit vectors gives the vector exactly in the middle of the INTERNAL angle
                    let sumX = vPrev.x + vNext.x;
                    let sumY = vPrev.y + vNext.y;
                    
                    // If sum is effectively 0, points are collinear (180 deg). 
                    // Choose a perpendicular direction (e.g., rotate vPrev 90 deg)
                    if (Math.abs(sumX) < 0.001 && Math.abs(sumY) < 0.001) {
                        dir = { x: -vPrev.y, y: vPrev.x }; 
                    } else {
                        // The sum points "inward". We want "outward", so negate it.
                        const bisector = normalize({ x: sumX, y: sumY });
                        dir = { x: -bisector.x, y: -bisector.y };
                    }
                } else if (hasPrev) {
                    // End point (Open path): Direction is away from previous
                    // vPrev points to previous, so -vPrev points away
                    dir = { x: -vPrev.x, y: -vPrev.y };
                } else if (hasNext) {
                    // Start point (Open path): Direction is away from next
                    // vNext points to next, so -vNext points away
                    dir = { x: -vNext.x, y: -vNext.y };
                }

                // Apply offset
                const offsetDistance = 15; // Distance from point center to text center
                const labelX = curr.x + dir.x * offsetDistance;
                const labelY = curr.y + dir.y * offsetDistance;

                ctx.fillText(index + 1, labelX, labelY);
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

    // NEW: Mouse Interaction for Hovering Points
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let found = null;
        const hoverThreshold = 8; // 鼠标靠近点 8 像素以内算选中

        // 逆序遍历，这样重叠时优先选中最上层的（后绘制的）
        for (let i = loadedPathData.length - 1; i >= 0; i--) {
            const item = loadedPathData[i];
            if (!item.visible) continue;

            for (let j = 0; j < item.path.length; j++) {
                const pt = item.path[j];
                // 计算屏幕坐标
                const screenX = originX + pt.x * scale;
                const screenY = originY - pt.y * scale;

                // 计算距离
                const dist = Math.hypot(mouseX - screenX, mouseY - screenY);

                if (dist < hoverThreshold) {
                    found = {
                        pathId: item.id,
                        index: j,
                        x: pt.x,
                        y: pt.y,
                        color: item.color
                    };
                    break; // 找到一个点后停止检查当前路径
                }
            }
            if (found) break; // 找到后停止所有检查
        }

        // 状态更新与重绘判断
        const prevHover = hoveredPoint;
        hoveredPoint = found;

        // 更新顶部信息栏
        if (hoveredPoint) {
            infoBar.textContent = `路径: ${hoveredPoint.pathId.split('-')[1]} | 序号: ${hoveredPoint.index + 1} | 坐标: (x: ${hoveredPoint.x}, y: ${hoveredPoint.y})`;
            infoBar.style.backgroundColor = '#e6f7ff'; // 淡淡的蓝色背景表示激活
            canvas.style.cursor = 'pointer';
        } else {
            infoBar.textContent = '鼠标悬停在点上查看详情';
            infoBar.style.backgroundColor = '#f0f0f0';
            canvas.style.cursor = 'default';
        }

        // 只有当悬停状态发生变化时才重绘（避免性能浪费）
        // 简单的比较对象引用是不够的，这里简单判断 pathId 和 index
        const isChange = (prevHover && !found) || 
                         (!prevHover && found) || 
                         (prevHover && found && (prevHover.pathId !== found.pathId || prevHover.index !== found.index));

        if (isChange) {
            render();
        }
    });
});