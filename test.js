
        import * as THREE from 'three';

        const CONFIG = {
            effectMode: 0,
            particleSize: 200,
            particleCount: 90000,
            interactionMode: "auto",
        };

        let particleSize = CONFIG.particleSize;
        const PARTICLE_COUNT = CONFIG.particleCount;
        let sceneData = null;
        let interactionMode = CONFIG.interactionMode;
        
        let bgThreshold = 50;
        let currentImageUrl = null;
        let hasMorphTarget = false; // 标志是否应用形变(吸附到目标)
        
        let targetPositionsStore = null; // 用于保存目标位置数据
        let targetColorsStore = null;    // 用于保存目标颜色数据

        const cameraControlState = {
            target: null, yaw: 0, pitch: 0, distance: 45,
            minDistance: 10, maxDistance: 120,
            isLeftDragging: false, isRightDragging: false,
            previousX: 0, previousY: 0
        };

        const vertexShader = `
            uniform float uTime;
            uniform float uMorph;
            uniform float uPointSize;
            
            attribute vec3 targetPosition;
            attribute vec3 targetColor;
            attribute vec3 color;
            
            varying vec3 vColor;
            varying float vDistance;
            
            void main() {
                vColor = mix(color, targetColor, uMorph);
                vec3 pos = mix(position, targetPosition, uMorph);
                
                // 增加基于时间的漂浮效果
                float noise = sin(uTime * 1.5 + position.x * 0.3) * cos(uTime * 1.5 + position.y * 0.3);
                pos += normalize(pos) * noise * (0.2 * (1.0 - uMorph));
                pos.x += sin(uTime * 0.3 + position.z) * 0.1;
                pos.y += cos(uTime * 0.3 + position.x) * 0.1;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                vDistance = -mvPosition.z;
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = uPointSize * (1.0 / -mvPosition.z);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            varying vec3 vColor;
            varying float vDistance;
            
            void main() {
                float dist = distance(gl_PointCoord, vec2(0.5));
                if (dist > 0.5) discard;
                
                float strength = pow(1.0 - dist * 2.0, 1.6);
                vec3 finalColor = vColor * 2.0;
                float alpha = strength * (0.8 + sin(vDistance * 0.3 + uTime) * 0.2);
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `;

        function updateCameraFromState(camera) {
            const cp = Math.cos(cameraControlState.pitch);
            const sp = Math.sin(cameraControlState.pitch);
            const cy = Math.cos(cameraControlState.yaw);
            const sy = Math.sin(cameraControlState.yaw);
            camera.position.set(
                cameraControlState.target.x + cameraControlState.distance * sy * cp,
                cameraControlState.target.y + cameraControlState.distance * sp,
                cameraControlState.target.z + cameraControlState.distance * cy * cp
            );
            camera.lookAt(cameraControlState.target);
        }

        function initParticleCanvas() {
            const container = document.getElementById("particle-container");
            const width = window.innerWidth, height = window.innerHeight;
            
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
            camera.position.z = 45;
            cameraControlState.target = new THREE.Vector3(0, 0, 0);
            updateCameraFromState(camera);
            
            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor(0x000000, 1);
            container.appendChild(renderer.domElement);
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(PARTICLE_COUNT * 3);
            const targetPositions = new Float32Array(PARTICLE_COUNT * 3);
            const colors = new Float32Array(PARTICLE_COUNT * 3);
            const targetColors = new Float32Array(PARTICLE_COUNT * 3);
            
            const greenColor = new THREE.Color(0x00ff66);
            const brightWhite = new THREE.Color(0xffffff);
            
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                const t = (Math.random() - 0.5) * 5.0;
                const angle = Math.random() * Math.PI * 2;
                const radiusBase = 0.4 + Math.pow(Math.abs(t), 2.4);
                const radius = radiusBase * (0.75 + Math.random() * 0.55);
                
                let x = radius * Math.cos(angle) * 2.9;
                let z = radius * Math.sin(angle) * 2.9;
                let y = t * 7.5;
                
                positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;
                targetPositions[i3] = x; targetPositions[i3 + 1] = y; targetPositions[i3 + 2] = z;
                
                const color = Math.random() > 0.7 ? greenColor : brightWhite;
                colors[i3] = color.r; colors[i3 + 1] = color.g; colors[i3 + 2] = color.b;
                targetColors[i3] = color.r; targetColors[i3 + 1] = color.g; targetColors[i3 + 2] = color.b;
            }
            
            geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute("targetPosition", new THREE.BufferAttribute(targetPositions, 3));
            geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute("targetColor", new THREE.BufferAttribute(targetColors, 3));
            
            const material = new THREE.ShaderMaterial({
                vertexShader, fragmentShader, transparent: true,
                uniforms: { 
                    uTime: { value: 0 }, 
                    uMorph: { value: 0 }, 
                    uPointSize: { value: particleSize }
                },
                depthWrite: false, 
                blending: THREE.AdditiveBlending
            });
            
            const points = new THREE.Points(geometry, material);
            scene.add(points);
            
            sceneData = { scene, camera, renderer, points, geometry, material, targetPositions, targetColors };
            targetPositionsStore = targetPositions;
            targetColorsStore = targetColors;

            let time = 0, morphFactor = 0;
            
            function animate() {
                requestAnimationFrame(animate);
                time += 0.008;
                
                if (!sceneData) return;
                const { renderer, scene, camera, points, material } = sceneData;
                
                if (interactionMode === "manual") {
                    updateCameraFromState(camera);
                } else {
                    points.rotation.y += 0.0025;
                    points.rotation.z += 0.001;
                    points.rotation.x = Math.sin(time * 0.15) * 0.12;
                }
                
                material.uniforms.uTime.value = time;
                material.uniforms.uPointSize.value = particleSize;
                
                const targetMorph = hasMorphTarget ? 1.0 : 0.0;
                morphFactor += (targetMorph - morphFactor) * 0.05; // 平滑形变动画
                material.uniforms.uMorph.value = morphFactor;
                
                renderer.render(scene, camera);
            }
            animate();

            // 交互事件监听
            window.addEventListener("resize", function() {
                if (!sceneData) return;
                sceneData.camera.aspect = window.innerWidth / window.innerHeight;
                sceneData.camera.updateProjectionMatrix();
                sceneData.renderer.setSize(window.innerWidth, window.innerHeight);
            });
            
            renderer.domElement.addEventListener("mousedown", function(e) {
                if (e.button === 0) cameraControlState.isLeftDragging = true;
                else if (e.button === 2) cameraControlState.isRightDragging = true;
                cameraControlState.previousX = e.clientX;
                cameraControlState.previousY = e.clientY;
                interactionMode = "manual";
            });
            
            window.addEventListener("mousemove", function(e) {
                if (!sceneData) return;
                const deltaX = e.clientX - cameraControlState.previousX;
                const deltaY = e.clientY - cameraControlState.previousY;
                
                if (cameraControlState.isLeftDragging) {
                    cameraControlState.yaw -= deltaX * 0.005;
                    cameraControlState.pitch -= deltaY * 0.005;
                    const maxPitch = Math.PI * 0.499;
                    if (cameraControlState.pitch > maxPitch) cameraControlState.pitch = maxPitch;
                    if (cameraControlState.pitch < -maxPitch) cameraControlState.pitch = -maxPitch;
                } else if (cameraControlState.isRightDragging) {
                    const panScale = cameraControlState.distance * 0.002;
                    const forward = new THREE.Vector3();
                    sceneData.camera.getWorldDirection(forward);
                    const right = new THREE.Vector3().crossVectors(forward, sceneData.camera.up).normalize();
                    const up = new THREE.Vector3().copy(sceneData.camera.up).normalize();
                    cameraControlState.target.addScaledVector(right, -deltaX * panScale);
                    cameraControlState.target.addScaledVector(up, deltaY * panScale);
                }
                cameraControlState.previousX = e.clientX;
                cameraControlState.previousY = e.clientY;
            });
            
            window.addEventListener("mouseup", function() {
                cameraControlState.isLeftDragging = false;
                cameraControlState.isRightDragging = false;
            });
            
            renderer.domElement.addEventListener("wheel", function(e) {
                e.preventDefault();
                cameraControlState.distance += e.deltaY * 0.03;
                if (cameraControlState.distance < cameraControlState.minDistance) cameraControlState.distance = cameraControlState.minDistance;
                if (cameraControlState.distance > cameraControlState.maxDistance) cameraControlState.distance = cameraControlState.maxDistance;
            }, { passive: false });
            
            renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
            
            window.addEventListener("keydown", function(e) {
                if (e.code === "Space" && !e.repeat) {
                    e.preventDefault();
                    interactionMode = interactionMode === "auto" ? "manual" : "auto";
                }
            });
        }

        // ==========================================
        // 数学函数生成3D几何体
        // ==========================================
        function generateShape(shapeName) {
            if (!sceneData) return;
            const { targetPositions, targetColors, geometry } = sceneData;
            
            const color1 = new THREE.Color(0x00ff66); // 科技绿
            const color2 = new THREE.Color(0x00ccff); // 赛博蓝
            const color3 = new THREE.Color(0xffffff); // 纯白

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const i3 = i * 3;
                let x = 0, y = 0, z = 0;
                let col = color1;

                if (shapeName === "cube") {
                    const size = 22;
                    const face = Math.floor(Math.random() * 6);
                    const a = (Math.random() - 0.5) * size;
                    const b = (Math.random() - 0.5) * size;
                    if (face === 0) { x = size/2; y = a; z = b; }
                    else if (face === 1) { x = -size/2; y = a; z = b; }
                    else if (face === 2) { x = a; y = size/2; z = b; }
                    else if (face === 3) { x = a; y = -size/2; z = b; }
                    else if (face === 4) { x = a; y = b; z = size/2; }
                    else { x = a; y = b; z = -size/2; }
                    col = Math.random() > 0.5 ? color1 : color2;
                } 
                else if (shapeName === "sphere") {
                    const r = 16;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    x = r * Math.sin(phi) * Math.cos(theta);
                    y = r * Math.sin(phi) * Math.sin(theta);
                    z = r * Math.cos(phi);
                    col = new THREE.Color().lerpColors(color1, color2, y/r * 0.5 + 0.5);
                }
                else if (shapeName === "mobius") {
                    // 莫比乌斯环参数方程
                    const u = Math.random() * Math.PI * 2;
                    const v = (Math.random() - 0.5) * 12; // 宽度
                    const R = 15; // 半径
                    x = (R + v * Math.cos(u / 2)) * Math.cos(u);
                    y = v * Math.sin(u / 2); 
                    z = (R + v * Math.cos(u / 2)) * Math.sin(u);
                    col = new THREE.Color().lerpColors(color1, color3, Math.abs(v)/6);
                }
                else if (shapeName === "pyramid") {
                    const height = 25;
                    const base = 25;
                    const onBase = Math.random() < 0.2;
                    if (onBase) {
                        x = (Math.random() - 0.5) * base;
                        z = (Math.random() - 0.5) * base;
                        y = -height / 2;
                    } else {
                        const t = Math.random(); // 从塔尖到塔底的插值
                        x = (Math.random() - 0.5) * base * (1 - t);
                        z = (Math.random() - 0.5) * base * (1 - t);
                        y = -height / 2 + t * height;
                    }
                    col = new THREE.Color().lerpColors(color1, color2, y/height + 0.5);
                }
                else if (shapeName === "dna") {
                    const t = (i / PARTICLE_COUNT) * Math.PI * 12;
                    y = (i / PARTICLE_COUNT - 0.5) * 50;
                    const r = 8;
                    const strand = i % 3; // 两条主链 + 中间连接键
                    if (strand === 0) {
                        x = r * Math.cos(t); z = r * Math.sin(t);
                        col = color1;
                    } else if (strand === 1) {
                        x = r * Math.cos(t + Math.PI); z = r * Math.sin(t + Math.PI);
                        col = color2;
                    } else {
                        const bp = Math.random();
                        x = r * Math.cos(t) * (1-bp) + r * Math.cos(t+Math.PI) * bp;
                        z = r * Math.sin(t) * (1-bp) + r * Math.sin(t+Math.PI) * bp;
                        col = color3;
                    }
                }
                else if (shapeName === "infinity") {
                    const t = (i / PARTICLE_COUNT) * Math.PI * 8;
                    const scale = 25;
                    const denom = 1 + Math.sin(t) * Math.sin(t);
                    x = scale * Math.cos(t) / denom;
                    z = scale * Math.sin(t) * Math.cos(t) / denom;
                    y = (Math.random() - 0.5) * 8 * Math.sin(t*4);
                    // 增加粗细
                    x += (Math.random() - 0.5) * 2;
                    y += (Math.random() - 0.5) * 2;
                    z += (Math.random() - 0.5) * 2;
                    col = new THREE.Color().lerpColors(color1, color2, Math.abs(x)/scale);
                }

                // 添加微小的随机扰动，让它看起来像粒子
                const spread = 0.8;
                x += (Math.random() - 0.5) * spread;
                y += (Math.random() - 0.5) * spread;
                z += (Math.random() - 0.5) * spread;

                targetPositions[i3] = x;
                targetPositions[i3 + 1] = y;
                targetPositions[i3 + 2] = z;
                
                targetColors[i3] = col.r;
                targetColors[i3 + 1] = col.g;
                targetColors[i3 + 2] = col.b;
            }
            
            geometry.attributes.targetPosition.needsUpdate = true;
            geometry.attributes.targetColor.needsUpdate = true;
            hasMorphTarget = true;
            
            // 如果生成了几何体，清除图片的选择状态
            document.getElementById('imageUpload').value = "";
        }

        // ==========================================
        // 图像处理逻辑 (含伪3D厚度挤出)
        // ==========================================
        function processImage(imageUrl) {
            if (!imageUrl || !sceneData) return;
            currentImageUrl = imageUrl;
            
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = imageUrl;
            img.onload = function() {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                const resolution = 200; // 解析精度
                
                const aspect = img.width / img.height;
                let drawWidth = aspect > 1 ? resolution : resolution * aspect;
                let drawHeight = aspect > 1 ? resolution / aspect : resolution;
                
                canvas.width = resolution; 
                canvas.height = resolution;
                ctx.fillStyle = "black"; 
                ctx.fillRect(0, 0, resolution, resolution);
                ctx.drawImage(img, (resolution - drawWidth) / 2, (resolution - drawHeight) / 2, drawWidth, drawHeight);
                
                const imgData = ctx.getImageData(0, 0, resolution, resolution).data;
                const validPoints = [];
                
                for (let y = 0; y < resolution; y++) {
                    for (let x = 0; x < resolution; x++) {
                        const idx = (y * resolution + x) * 4;
                        const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
                        
                        // 应用背景阈值过滤
                        if ((r + g + b) / 3 > bgThreshold) {
                            validPoints.push({ 
                                pos: [
                                    (x / resolution - 0.5) * 38, 
                                    (0.5 - y / resolution) * 38, 
                                    0 // 纯2D，Z轴为0
                                ], 
                                col: [r / 255, g / 255, b / 255] 
                            });
                        }
                    }
                }
                
                if (validPoints.length > 0) {
                    const { targetPositions, targetColors, geometry } = sceneData;
                    for (let i = 0; i < PARTICLE_COUNT; i++) {
                        const i3 = i * 3;
                        const point = validPoints[i % validPoints.length];
                        
                        // 增加轻微的X和Y轴扰动以增强体积感
                        targetPositions[i3] = point.pos[0] + (Math.random() - 0.5) * 0.4;
                        targetPositions[i3 + 1] = point.pos[1] + (Math.random() - 0.5) * 0.4;
                        targetPositions[i3 + 2] = point.pos[2];
                        
                        targetColors[i3] = point.col[0]; 
                        targetColors[i3 + 1] = point.col[1]; 
                        targetColors[i3 + 2] = point.col[2];
                    }
                    geometry.attributes.targetPosition.needsUpdate = true;
                    geometry.attributes.targetColor.needsUpdate = true;
                    hasMorphTarget = true;
                    
                    // 重置几何体选择框
                    document.getElementById('shapeSelect').value = "none";
                }
            };
        }

        // ==========================================
        // UI 事件监听器
        // ==========================================
        document.getElementById('imageUpload').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    processImage(event.target.result);
                };
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('shapeSelect').addEventListener('change', function(e) {
            const shape = e.target.value;
            if (shape === 'none') {
                hasMorphTarget = false; // 恢复默认的散乱星空
            } else {
                generateShape(shape);
            }
        });

        document.getElementById('threshold').addEventListener('input', function(e) {
            bgThreshold = parseInt(e.target.value);
            document.getElementById('thresholdVal').innerText = bgThreshold;
            if (currentImageUrl && document.getElementById('shapeSelect').value === 'none') {
                processImage(currentImageUrl); // 重新应用阈值
            }
        });

        document.getElementById('pSize').addEventListener('input', function(e) {
            particleSize = parseInt(e.target.value);
            document.getElementById('sizeVal').innerText = particleSize;
        });

        initParticleCanvas();

        // ==========================================
        // 导出功能
        // ==========================================
        document.getElementById('btnExportHTML').addEventListener('click', function() {
            if (!hasMorphTarget || !targetPositionsStore || !targetColorsStore) {
                alert("请先上传图片或选择几何模型生成粒子！");
                return;
            }
            
            // 提取核心顶点数据
            const positionsArr = Array.from(targetPositionsStore);
            const colorsArr = Array.from(targetColorsStore);
            
            // 生成独立的 HTML 内容
            const exportHtmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Particle Effect</title>
    <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
      }
    }
    <\/script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { overflow: hidden; background-color: #000; }
        canvas { display: block; }
    </style>
</head>
<body>
    <script type="module">
        import * as THREE from 'three';

        // 注入数据
        const PARTICLE_COUNT = ${PARTICLE_COUNT};
        const particleSize = ${particleSize};
        const targetPositions = new Float32Array(${JSON.stringify(positionsArr)});
        const targetColors = new Float32Array(${JSON.stringify(colorsArr)});

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 45;
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(renderer.domElement);

        const geometry = new THREE.BufferGeometry();
        
        // 初始位置和颜色（打乱）
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            const t = (Math.random() - 0.5) * 5.0;
            const angle = Math.random() * Math.PI * 2;
            const radiusBase = 0.4 + Math.pow(Math.abs(t), 2.4);
            const radius = radiusBase * (0.75 + Math.random() * 0.55);
            
            positions[i3] = radius * Math.cos(angle) * 2.9; 
            positions[i3 + 1] = t * 7.5; 
            positions[i3 + 2] = radius * Math.sin(angle) * 2.9;
            
            colors[i3] = 1; colors[i3 + 1] = 1; colors[i3 + 2] = 1;
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("targetPosition", new THREE.BufferAttribute(targetPositions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute("targetColor", new THREE.BufferAttribute(targetColors, 3));

        const vertexShader = \`${vertexShader}\`;
        const fragmentShader = \`${fragmentShader}\`;

        const material = new THREE.ShaderMaterial({
            vertexShader, fragmentShader, transparent: true,
            uniforms: { 
                uTime: { value: 0 }, 
                uMorph: { value: 0 }, 
                uPointSize: { value: particleSize }
            },
            depthWrite: false, 
            blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

        let time = 0;
        let morphFactor = 0;

        function animate() {
            requestAnimationFrame(animate);
            time += 0.008;
            
            points.rotation.y += 0.0025;
            points.rotation.z += 0.001;
            points.rotation.x = Math.sin(time * 0.15) * 0.12;
            
            morphFactor += (1.0 - morphFactor) * 0.05;
            
            material.uniforms.uTime.value = time;
            material.uniforms.uMorph.value = morphFactor;
            
            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener("resize", function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    <\/script>
</body>
</html>`;

            const blob = new Blob([exportHtmlContent], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "Particle_Effect.html";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        // 导出 MP4 功能 (使用 MediaRecorder)
        let mediaRecorder;
        let recordedChunks = [];
        
        document.getElementById('btnExportMP4').addEventListener('click', async function() {
            if (!hasMorphTarget) {
                alert("请先上传图片或选择几何模型生成粒子！");
                return;
            }
            
            const btn = document.getElementById('btnExportMP4');
            if (mediaRecorder && mediaRecorder.state === "recording") {
                // 停止录制
                mediaRecorder.stop();
                btn.innerText = "🎥 导出 MP4";
                btn.style.background = "#00ff66";
                return;
            }

            // 开始录制
            const canvas = document.querySelector('canvas');
            if (!canvas) return;

            try {
                const stream = canvas.captureStream(30); // 30 FPS
                
                // 尝试不同的编码格式，优先选 mp4/webm
                let options = { mimeType: 'video/webm; codecs=vp9' };
                if (MediaRecorder.isTypeSupported('video/mp4')) {
                    options = { mimeType: 'video/mp4' };
                } else if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: 'video/webm' };
                }

                mediaRecorder = new MediaRecorder(stream, options);
                recordedChunks = [];

                mediaRecorder.ondataavailable = function(e) {
                    if (e.data.size > 0) {
                        recordedChunks.push(e.data);
                    }
                };

                mediaRecorder.onstop = function() {
                    const blob = new Blob(recordedChunks, { type: options.mimeType });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    // 如果浏览器不支持原生 mp4，默认导出 webm，现代播放器均支持
                    const ext = options.mimeType.includes('mp4') ? 'mp4' : 'webm';
                    a.download = \`Particle_Effect.\${ext}\`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };

                // 设置强制自动旋转以便录制
                interactionMode = "auto";
                
                mediaRecorder.start();
                btn.innerText = "⏹️ 停止录制并保存";
                btn.style.background = "#ff3333";
                
                // 默认录制 5 秒后自动停止，或者用户手动点击停止
                setTimeout(() => {
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.stop();
                        btn.innerText = "🎥 导出 MP4";
                        btn.style.background = "#00ff66";
                    }
                }, 5000);

            } catch (err) {
                console.error(err);
                alert("当前浏览器不支持录制 Canvas。");
            }
        });

    