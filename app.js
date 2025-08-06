/* --- JavaScript --- */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const canvasContainer = document.getElementById('canvas-container');
    const imageLoader = document.getElementById('imageLoader');
    const jewelryPalette = document.getElementById('jewelry-palette');
    const imageAdjustSection = document.getElementById('image-adjust-section');
    const zoomSlider = document.getElementById('zoom-slider');
    const resetViewBtn = document.getElementById('reset-view-btn');
    const jewelryControlsSection = document.getElementById('jewelry-controls-section');
    const sizeSlider = document.getElementById('size-slider');
    const lengthSliderContainer = document.getElementById('length-slider-container');
    const lengthSlider = document.getElementById('length-slider');
    const rotationSlider = document.getElementById('rotation-slider');
    const deleteBtn = document.getElementById('delete-btn');
    const downloadBtn = document.getElementById('download-btn');
    const clearBtn = document.getElementById('clear-btn');

    // --- State Variables ---
    let backgroundImage = null;
    let placedJewelry = [];
    let selectedJewelryIndex = -1;
    let selectedPaletteJewelry = null;
    let scale = 1.0;
    let offsetX = 0;
    let offsetY = 0;
    let isDraggingJewelry = false;
    let isPanning = false;
    let dragStart = { x: 0, y: 0 };
    
    // --- Jewelry Definitions ---
    // Create an array of 39 earring images (earring_01.png to earring_39.png)
    const jewelryTypes = Array.from({ length: 39 }, (_, i) => {
        const num = i + 1; // 1-based index for filenames
        const name = `earring_${num.toString().padStart(2, '0')}`;
        return {
            name: name,
            type: 'image',
            url: `img/${name}.png`,
            // Keep the original size ratio when resizing
            draw: function(ctx, size, length) {
                const img = jewelryImageCache[this.name];
                if (img && img.complete) {
                    const ratio = Math.min(size / img.width, size / img.height) * 0.8; // 0.8 scale factor to fit within the size
                    const newWidth = img.width * ratio;
                    const newHeight = img.height * ratio;
                    ctx.drawImage(img, -newWidth/2, -newHeight/2, newWidth, newHeight);
                } else {
                    // Fallback: draw a simple placeholder if image fails to load
                    ctx.fillStyle = '#f0f0f0';
                    ctx.fillRect(-size/2, -size/2, size, size);
                    ctx.strokeStyle = '#ccc';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(-size/2, -size/2, size, size);
                    ctx.fillStyle = '#999';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = '10px Arial';
                    ctx.fillText('Earring ' + num, 0, 0);
                }
            }
        };
    });

    const jewelryImageCache = {};
    jewelryTypes.forEach(j => {
        if (j.type === 'image') {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // Handle potential CORS issues with images
            img.src = j.url;
            jewelryImageCache[j.name] = img;
        }
    });
    
    // --- Initialization ---
    function init() {
        resizeCanvas();
        populateJewelryPalette();
        addEventListeners();
        drawCanvas();
    }

    function resizeCanvas() {
        const containerSize = canvasContainer.getBoundingClientRect();
        canvas.width = containerSize.width;
        canvas.height = containerSize.height;
        drawCanvas();
    }

    function populateJewelryPalette() {
        jewelryPalette.innerHTML = '';
        jewelryTypes.forEach(type => {
            const item = document.createElement('div');
            item.className = 'jewelry-item p-2 border rounded-lg cursor-pointer aspect-square';
            item.dataset.jewelryType = type.name;

            let iconUrl;

            if (type.type === 'image') {
                iconUrl = type.url;
            } else if (type.type === 'draw') {
                const iconCanvas = document.createElement('canvas');
                iconCanvas.width = 40;
                iconCanvas.height = 40;
                const iconCtx = iconCanvas.getContext('2d');
                iconCtx.translate(20, 20);
                type.draw(iconCtx, 30, 30); // Use a standard size for the icon
                iconUrl = iconCanvas.toDataURL(); // Convert canvas to image data
            }

            item.style.backgroundImage = `url('${iconUrl}')`; // Set as background

            item.addEventListener('click', () => {
                document.querySelectorAll('.jewelry-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedPaletteJewelry = type;
            });
            jewelryPalette.appendChild(item);
        });
    }

    // --- Coordinate Transformation & Event Handlers ---
    function getEventCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function canvasToImageCoords(p) {
        return { x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale };
    }

    function addEventListeners() {
        window.addEventListener('resize', resizeCanvas);
        imageLoader.addEventListener('change', handleImageUpload);
        canvas.addEventListener('mousedown', handleInteractionStart);
        canvas.addEventListener('mousemove', handleInteractionMove);
        canvas.addEventListener('mouseup', handleInteractionEnd);
        canvas.addEventListener('mouseleave', handleInteractionEnd);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('touchstart', handleInteractionStart, { passive: false });
        canvas.addEventListener('touchmove', handleInteractionMove, { passive: false });
        canvas.addEventListener('touchend', handleInteractionEnd);
        zoomSlider.addEventListener('input', handleZoomSlider);
        resetViewBtn.addEventListener('click', resetImageTransform);
        sizeSlider.addEventListener('input', handleSizeChange);
        lengthSlider.addEventListener('input', handleLengthChange);
        rotationSlider.addEventListener('input', handleRotationChange);
        deleteBtn.addEventListener('click', deleteSelectedJewelry);
        downloadBtn.addEventListener('click', downloadDesign);
        clearBtn.addEventListener('click', clearAll);
    }

    function handleImageUpload(e) {
        const reader = new FileReader();
        reader.onload = (event) => {
            backgroundImage = new Image();
            backgroundImage.onload = () => {
                imageAdjustSection.classList.remove('hidden');
                resetImageTransform();
            };
            backgroundImage.src = event.target.result;
        };
        if (e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
    }

    function handleInteractionStart(e) {
        e.preventDefault();
        dragStart = getEventCoordinates(e);
        const imageCoords = canvasToImageCoords(dragStart);
        const clickedIndex = getJewelryAtPosition(imageCoords.x, imageCoords.y);

        if (clickedIndex !== -1) {
            selectJewelryOnCanvas(clickedIndex);
            isDraggingJewelry = true;
        } else {
            if (selectedPaletteJewelry) {
                placeNewJewelry(imageCoords.x, imageCoords.y);
                document.querySelector('.jewelry-item.selected')?.classList.remove('selected');
                selectedPaletteJewelry = null;
            } else {
                isPanning = true;
                deselectJewelryOnCanvas();
            }
        }
    }

    function handleInteractionMove(e) {
        e.preventDefault();
        if (!isDraggingJewelry && !isPanning) return;
        const currentPos = getEventCoordinates(e);
        const dx = currentPos.x - dragStart.x;
        const dy = currentPos.y - dragStart.y;

        if (isDraggingJewelry && selectedJewelryIndex !== -1) {
            const jewelry = placedJewelry[selectedJewelryIndex];
            jewelry.x += dx / scale;
            jewelry.y += dy / scale;
        } else if (isPanning) {
            offsetX += dx;
            offsetY += dy;
        }
        dragStart = currentPos;
        drawCanvas();
    }

    function handleInteractionEnd() {
        isDraggingJewelry = false;
        isPanning = false;
    }

    function handleWheel(e) {
        if (!backgroundImage) return;
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(scale + scaleAmount, 0.5), 5);
        const mousePos = getEventCoordinates(e);
        zoomAtPoint(newScale, mousePos);
    }
    
    function handleZoomSlider(e) {
        if (!backgroundImage) return;
        const newScale = parseFloat(e.target.value);
        const center = { x: canvas.width / 2, y: canvas.height / 2 };
        zoomAtPoint(newScale, center);
    }

    function handleSizeChange(e) {
        if (selectedJewelryIndex !== -1) {
            placedJewelry[selectedJewelryIndex].size = parseInt(e.target.value);
            drawCanvas();
        }
    }
    
    function handleLengthChange(e) {
        if (selectedJewelryIndex !== -1) {
            placedJewelry[selectedJewelryIndex].length = parseInt(e.target.value);
            drawCanvas();
        }
    }

    function handleRotationChange(e) {
        if (selectedJewelryIndex !== -1) {
            placedJewelry[selectedJewelryIndex].rotation = parseInt(e.target.value);
            drawCanvas();
        }
    }

    // --- Core Logic ---
    function zoomAtPoint(newScale, point) {
        const imagePoint = canvasToImageCoords(point);
        scale = newScale;
        offsetX = point.x - imagePoint.x * scale;
        offsetY = point.y - imagePoint.y * scale;
        zoomSlider.value = scale;
        drawCanvas();
    }
    
    function resetImageTransform() {
        if (!backgroundImage) return;
        const hRatio = canvas.width / backgroundImage.width;
        const vRatio = canvas.height / backgroundImage.height;
        scale = Math.min(hRatio, vRatio);
        offsetX = (canvas.width - backgroundImage.width * scale) / 2;
        offsetY = (canvas.height - backgroundImage.height * scale) / 2;
        zoomSlider.value = scale;
        drawCanvas();
    }
    
    function placeNewJewelry(x, y) {
         const newJewelry = {
            type: selectedPaletteJewelry,
            x, y,
            size: parseInt(sizeSlider.value),
            length: selectedPaletteJewelry.scalableLength ? parseInt(lengthSlider.value) : parseInt(sizeSlider.value),
            rotation: 0,
        };
        placedJewelry.push(newJewelry);
        selectJewelryOnCanvas(placedJewelry.length - 1);
    }

    function getJewelryAtPosition(imgX, imgY) {
        for (let i = placedJewelry.length - 1; i >= 0; i--) {
            const jewelry = placedJewelry[i];
            const dx = imgX - jewelry.x;
            const dy = imgY - jewelry.y;
            const hitSize = jewelry.length ? Math.max(jewelry.size, jewelry.length) : jewelry.size;
            if (Math.sqrt(dx * dx + dy * dy) < (hitSize / 2)) {
                return i;
            }
        }
        return -1;
    }

    function selectJewelryOnCanvas(index) {
        selectedJewelryIndex = index;
        const jewelry = placedJewelry[index];
        jewelryControlsSection.classList.remove('hidden');
        sizeSlider.value = jewelry.size;
        rotationSlider.value = jewelry.rotation;

        if (jewelry.type.scalableLength) {
            lengthSliderContainer.classList.remove('hidden');
            lengthSlider.value = jewelry.length;
        } else {
            lengthSliderContainer.classList.add('hidden');
        }

        drawCanvas();
    }

    function deselectJewelryOnCanvas() {
        selectedJewelryIndex = -1;
        jewelryControlsSection.classList.add('hidden');
        lengthSliderContainer.classList.add('hidden');
        drawCanvas();
    }

    function deleteSelectedJewelry() {
        if (selectedJewelryIndex !== -1) {
            placedJewelry.splice(selectedJewelryIndex, 1);
            deselectJewelryOnCanvas();
        }
    }
    
    function downloadDesign() {
        const tempSelection = selectedJewelryIndex;
        deselectJewelryOnCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'piercing-design.png';
        link.href = dataUrl;
        link.click();
        if (tempSelection !== -1 && tempSelection < placedJewelry.length) {
            selectJewelryOnCanvas(tempSelection);
        }
    }

    function clearAll() {
        backgroundImage = null;
        placedJewelry = [];
        deselectJewelryOnCanvas();
        imageLoader.value = '';
        imageAdjustSection.classList.add('hidden');
        resetImageTransform();
    }

    // --- Drawing ---
    function drawCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        if (backgroundImage) {
            ctx.drawImage(backgroundImage, 0, 0);
        } else {
            ctx.restore();
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '16px Inter';
            ctx.fillText('Upload an image to begin', canvas.width / 2, canvas.height / 2);
            ctx.save();
        }

        placedJewelry.forEach((jewelry) => {
            ctx.save();
            ctx.translate(jewelry.x, jewelry.y);
            ctx.rotate(jewelry.rotation * Math.PI / 180);
            if (jewelry.type.type === 'image') {
                const img = jewelryImageCache[jewelry.type.name];
                if (img && img.complete) {
                    ctx.drawImage(img, -jewelry.size / 2, -jewelry.size / 2, jewelry.size, jewelry.size);
                }
            } else if (jewelry.type.type === 'draw') {
                const length = jewelry.type.scalableLength ? jewelry.length : jewelry.size;
                jewelry.type.draw(ctx, jewelry.size, length);
            }
            ctx.restore();
        });
        
        ctx.restore();

        if (selectedJewelryIndex !== -1) {
            const jewelry = placedJewelry[selectedJewelryIndex];
            const length = jewelry.type.scalableLength ? jewelry.length : jewelry.size;
            const boxWidth = length * scale;
            const boxHeight = jewelry.size * scale;

            const centerX = jewelry.x * scale + offsetX;
            const centerY = jewelry.y * scale + offsetY;
            
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(jewelry.rotation * Math.PI / 180);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(-boxWidth/2 - 5, -boxHeight/2 - 5, boxWidth + 10, boxHeight + 10);
            ctx.restore();
        }
    }
    init();
});
