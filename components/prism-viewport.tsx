"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { GIFEncoder, applyPalette, quantize, type GifPixelFormat } from "gifenc";
import * as THREE from "three";

export type ShapeKind = "pyramid" | "tetrahedron" | "cube" | "sphere" | "dodecahedron" | "distyloid";

export type TextureControls = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
};

export type ExportBackground = "alpha" | "gradient" | "white";

export type CaptureApi = {
  image: (background: ExportBackground) => string | null;
  gif: (background: ExportBackground) => Promise<Blob | null>;
};

type PrismViewportProps = {
  autoRotate: boolean;
  controls: TextureControls;
  imageUrl: string | null;
  shape: ShapeKind;
  onCaptureReady: (capture: CaptureApi) => void;
  onControlsChange: (controls: TextureControls) => void;
};

type DragState = {
  pointerId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
};

type VaporwaveScene = {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
};

const placeholderTextureSize = 1024;
const exportCanvasSize = 1600;
const gifCanvasSize = 640;
const gifFrameCount = 32;
const gifFrameDelayMs = 70;
const obamaPrismRotation: [number, number, number] = [0.08, -0.58, 0.02];
const obamaPrismDisplayScale = 0.64;
const obamaPrismExportScale = 0.82;

export function PrismViewport({
  autoRotate,
  controls,
  imageUrl,
  shape,
  onCaptureReady,
  onControlsChange,
}: PrismViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const frameRef = useRef<number | null>(null);
  const controlsRef = useRef(controls);
  const autoRotateRef = useRef(autoRotate);
  const dragRef = useRef<DragState | null>(null);
  const initialShapeRef = useRef(shape);
  const vaporwaveRef = useRef<VaporwaveScene | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const gradientImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    controlsRef.current = controls;
    applyTextureTransform(textureRef.current, controls);
  }, [controls]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const image = new Image();
    image.decoding = "async";
    image.src = "dither-gradient.png";
    gradientImageRef.current = image;
    return () => {
      gradientImageRef.current = null;
    };
  }, []);

  const createMaterial = useCallback((texture: THREE.Texture) => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.58,
      metalness: 0.03,
      side: THREE.FrontSide,
    });
  }, []);

  const prepareExportRender = useCallback((exportBackground: ExportBackground, canvasSize: number) => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const mesh = meshRef.current;
    if (!renderer || !scene || !camera || !mesh) {
      return null;
    }

    const floor = floorRef.current;
    const vaporwave = vaporwaveRef.current;
    const previousSceneBackground = scene.background;
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousRotation = mesh.rotation.clone();
    const previousPosition = mesh.position.clone();
    const previousScale = mesh.scale.clone();
    const previousCameraAspect = camera.aspect;
    const previousCameraPosition = camera.position.clone();
    const previousCameraQuaternion = camera.quaternion.clone();
    const previousPixelRatio = renderer.getPixelRatio();
    const previousRendererSize = renderer.getSize(new THREE.Vector2());
    const previousFloorVisible = floor?.visible ?? false;
    const previousVaporwaveVisible = vaporwave?.group.visible ?? false;

    if (floor) {
      floor.visible = false;
    }
    if (vaporwave) {
      vaporwave.group.visible = false;
    }

    applyShapePose(mesh, true);
    mesh.position.set(0, 0, 0);
    camera.aspect = 1;
    camera.position.set(0, 1.05, 7.5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(1);
    renderer.setSize(canvasSize, canvasSize, false);
    scene.background = null;
    renderer.setClearColor(0xffffff, 0);

    return {
      renderer,
      scene,
      camera,
      mesh,
      restore: () => {
        scene.background = previousSceneBackground;
        renderer.setClearColor(previousClearColor, previousClearAlpha);
        mesh.position.copy(previousPosition);
        mesh.rotation.copy(previousRotation);
        mesh.scale.copy(previousScale);
        camera.aspect = previousCameraAspect;
        camera.position.copy(previousCameraPosition);
        camera.quaternion.copy(previousCameraQuaternion);
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(previousPixelRatio);
        renderer.setSize(previousRendererSize.x, previousRendererSize.y, false);
        if (floor) {
          floor.visible = previousFloorVisible;
        }
        if (vaporwave) {
          vaporwave.group.visible = previousVaporwaveVisible;
        }
        renderer.render(scene, camera);
      },
    };
  }, []);

  const captureMemeRender = useCallback(
    (exportBackground: ExportBackground) => {
      const exportState = prepareExportRender(exportBackground, exportCanvasSize);
      if (!exportState) {
        return null;
      }

      const { renderer, scene, camera, mesh, restore } = exportState;
      try {
        centerMeshInExport(mesh, camera);
        renderer.render(scene, camera);
        return composeExportFrame(
          renderer.domElement,
          exportBackground,
          exportCanvasSize,
          gradientImageRef.current,
        ).toDataURL("image/png");
      } finally {
        restore();
      }
    },
    [prepareExportRender],
  );

  const captureSpinningGif = useCallback(
    async (exportBackground: ExportBackground) => {
      const exportState = prepareExportRender(exportBackground, gifCanvasSize);
      if (!exportState) {
        return null;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const { renderer, scene, camera, mesh, restore } = exportState;
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = gifCanvasSize;
      frameCanvas.height = gifCanvasSize;
      const context = frameCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        restore();
        return null;
      }

      const gif = GIFEncoder();
      const baseRotation = mesh.rotation.clone();
      const format: GifPixelFormat = exportBackground === "alpha" ? "rgba4444" : "rgb565";

      try {
        for (let frame = 0; frame < gifFrameCount; frame += 1) {
          const progress = frame / gifFrameCount;
          mesh.rotation.set(baseRotation.x, baseRotation.y + progress * Math.PI * 2, baseRotation.z);
          centerMeshInExport(mesh, camera);
          renderer.render(scene, camera);
          paintExportBackground(context, exportBackground, gifCanvasSize, gradientImageRef.current);
          context.drawImage(renderer.domElement, 0, 0, gifCanvasSize, gifCanvasSize);

          const { data } = context.getImageData(0, 0, gifCanvasSize, gifCanvasSize);
          const palette = quantize(data, 256, {
            format,
            oneBitAlpha: exportBackground === "alpha" ? 24 : false,
          });
          const index = applyPalette(data, palette, format);
          const transparentIndex =
            exportBackground === "alpha"
              ? palette.findIndex((color) => color.length > 3 && color[3] === 0)
              : -1;

          gif.writeFrame(index, gifCanvasSize, gifCanvasSize, {
            palette,
            delay: gifFrameDelayMs,
            repeat: 0,
            transparent: transparentIndex >= 0,
            transparentIndex: Math.max(0, transparentIndex),
          });

          if (frame % 4 === 3) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        }

        gif.finish();
        const bytes = gif.bytes();
        const gifBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(gifBuffer).set(bytes);
        return new Blob([gifBuffer], { type: "image/gif" });
      } finally {
        restore();
      }
    },
    [prepareExportRender],
  );

  useEffect(() => {
    onCaptureReady({
      image: captureMemeRender,
      gif: captureSpinningGif,
    });
  }, [captureMemeRender, captureSpinningGif, onCaptureReady]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }
    const hostElement: HTMLDivElement = host;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.05, 7.5);
    camera.lookAt(0, -0.2, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    hostElement.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.HemisphereLight(0xfff2dc, 0x1b2130, 2.8);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(4, 5, 5);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x71d4cb, 1.2);
    fill.position.set(-4, 2, 3);
    scene.add(fill);

    const vaporwave = createVaporwaveScene();
    scene.add(vaporwave.group);
    vaporwaveRef.current = vaporwave;

    const texture = createPlaceholderTexture();
    textureRef.current = texture;
    applyTextureTransform(texture, controlsRef.current);

    const mesh = new THREE.Mesh(createGeometry(initialShapeRef.current), createMaterial(texture));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = !isBackgroundSceneTest();
    applyShapePose(mesh);
    scene.add(mesh);
    meshRef.current = mesh;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
    );
    floor.visible = false;
    floor.position.y = -1.28;
    floor.position.z = -0.4;
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

    function resize() {
      const { width, height } = hostElement.getBoundingClientRect();
      const nextWidth = Math.max(1, width);
      const nextHeight = Math.max(1, height);
      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostElement);
    resize();

    const clock = new THREE.Clock();

    function animate() {
      const delta = clock.getDelta();
      vaporwave.update(clock.elapsedTime);
      const activeMesh = meshRef.current;
      if (activeMesh && autoRotateRef.current && !dragRef.current) {
        activeMesh.rotation.y += delta * 0.42;
      }
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      resizeObserver.disconnect();
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      renderer.dispose();
      texture.dispose();
      disposeMesh(mesh);
      vaporwave.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      hostElement.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      meshRef.current = null;
      textureRef.current = null;
      vaporwaveRef.current = null;
      floorRef.current = null;
    };
  }, [createMaterial]);

  useEffect(() => {
    const scene = sceneRef.current;
    const currentMesh = meshRef.current;
    const texture = textureRef.current;
    if (!scene || !currentMesh || !texture) {
      return;
    }

    const nextMesh = new THREE.Mesh(createGeometry(shape), createMaterial(texture));
    nextMesh.castShadow = true;
    nextMesh.receiveShadow = true;
    nextMesh.visible = currentMesh.visible;
    applyShapePose(nextMesh);
    scene.remove(currentMesh);
    disposeMesh(currentMesh, false);
    scene.add(nextMesh);
    meshRef.current = nextMesh;
  }, [createMaterial, shape]);

  useEffect(() => {
    if (!imageUrl) {
      const texture = createPlaceholderTexture();
      swapTexture(texture, controlsRef.current);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      swapTexture(texture, controlsRef.current);
    });
  }, [imageUrl]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: controlsRef.current.offsetX,
      offsetY: controlsRef.current.offsetY,
    };
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const dx = (event.clientX - drag.x) / Math.max(1, bounds.width);
      const dy = (event.clientY - drag.y) / Math.max(1, bounds.height);
      onControlsChange({
        ...controlsRef.current,
        offsetX: wrapTextureOffset(drag.offsetX + dx * 1.75),
        offsetY: wrapTextureOffset(drag.offsetY - dy * 1.75),
      });
    },
    [onControlsChange],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const viewportClass = useMemo(() => {
    return "obama-gradient-bg";
  }, []);

  function swapTexture(texture: THREE.Texture, nextControls: TextureControls) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() ?? 1;
    applyTextureTransform(texture, nextControls);

    const oldTexture = textureRef.current;
    textureRef.current = texture;
    const mesh = meshRef.current;
    if (mesh) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map = texture;
      material.needsUpdate = true;
    }
    oldTexture?.dispose();
  }

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-[620px] cursor-grab touch-none active:cursor-grabbing ${viewportClass}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="application"
      style={{ backgroundImage: `url("dither-gradient.png")` }}
      aria-label="3D prism projection viewport"
    />
  );
}

function composeExportFrame(
  sourceCanvas: HTMLCanvasElement,
  background: ExportBackground,
  size: number,
  gradientImage: HTMLImageElement | null,
) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return sourceCanvas;
  }

  paintExportBackground(context, background, size, gradientImage);
  context.drawImage(sourceCanvas, 0, 0, size, size);
  return canvas;
}

function paintExportBackground(
  context: CanvasRenderingContext2D,
  background: ExportBackground,
  size: number,
  gradientImage: HTMLImageElement | null,
) {
  context.clearRect(0, 0, size, size);

  if (background === "alpha") {
    return;
  }

  if (background === "white") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    return;
  }

  context.imageSmoothingEnabled = false;
  if (gradientImage?.complete && gradientImage.naturalWidth > 0) {
    context.drawImage(gradientImage, 0, 0, size, size);
    return;
  }

  paintFallbackDitherGradient(context, size);
}

function paintFallbackDitherGradient(context: CanvasRenderingContext2D, size: number) {
  const imageData = context.createImageData(size, size);
  const stops = [
    { at: 0, color: [255, 143, 56] },
    { at: 0.38, color: [251, 57, 126] },
    { at: 0.72, color: [168, 45, 143] },
    { at: 1, color: [205, 22, 74] },
  ];
  const bayer = [
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ];

  for (let y = 0; y < size; y += 1) {
    const t = y / Math.max(1, size - 1);
    const lowerStop = stops.findLast((stop) => stop.at <= t) ?? stops[0];
    const upperStop = stops.find((stop) => stop.at >= t) ?? stops[stops.length - 1];
    const span = Math.max(0.0001, upperStop.at - lowerStop.at);
    const localT = (t - lowerStop.at) / span;
    const threshold = (bayer[(y % 8) * 8] / 63 - 0.5) * 22;

    for (let x = 0; x < size; x += 1) {
      const pattern = (bayer[(y % 8) * 8 + (x % 8)] / 63 - 0.5) * 18 + threshold;
      const index = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const raw = lowerStop.color[channel] + (upperStop.color[channel] - lowerStop.color[channel]) * localT;
        imageData.data[index + channel] = Math.max(0, Math.min(255, Math.round((raw + pattern) / 17) * 17));
      }
      imageData.data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
}

function centerMeshInExport(mesh: THREE.Mesh, camera: THREE.PerspectiveCamera) {
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
  mesh.position.sub(center);
  mesh.updateMatrixWorld(true);

  for (let pass = 0; pass < 3; pass += 1) {
    const projectedCenter = getProjectedMeshCenter(mesh, camera);
    if (!projectedCenter || (Math.abs(projectedCenter.x) < 0.002 && Math.abs(projectedCenter.y) < 0.002)) {
      break;
    }

    const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
    const distance = camera.position.distanceTo(worldPosition);
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
    const viewWidth = viewHeight * camera.aspect;
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    mesh.position.addScaledVector(cameraRight, -projectedCenter.x * viewWidth * 0.5);
    mesh.position.addScaledVector(cameraUp, -projectedCenter.y * viewHeight * 0.5);
    mesh.updateMatrixWorld(true);
  }
}

function getProjectedMeshCenter(mesh: THREE.Mesh, camera: THREE.PerspectiveCamera) {
  const box = new THREE.Box3().setFromObject(mesh);
  if (box.isEmpty()) {
    return null;
  }

  const { min, max } = box;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    const projected = corner.project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      continue;
    }
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return new THREE.Vector2((minX + maxX) * 0.5, (minY + maxY) * 0.5);
}

function createGeometry(shape: ShapeKind) {
  if (shape === "cube") {
    return applyCylindricalWrapUvs(new THREE.BoxGeometry(2.25, 2.25, 2.25, 1, 1, 1));
  }

  if (shape === "sphere") {
    return new THREE.SphereGeometry(1.45, 96, 48);
  }

  if (shape === "dodecahedron") {
    const geometry = applyCylindricalWrapUvs(new THREE.DodecahedronGeometry(1.72, 0));
    geometry.computeVertexNormals();
    return geometry;
  }

  if (shape === "tetrahedron") {
    const geometry = applyCylindricalWrapUvs(new THREE.TetrahedronGeometry(1.8, 0));
    geometry.computeVertexNormals();
    return geometry;
  }

  if (shape === "distyloid") {
    return createDistyloidGeometry();
  }

  return createPyramidGeometry();
}

function applyShapePose(mesh: THREE.Mesh, exportRender = false) {
  mesh.position.set(0, -0.08, 0);
  mesh.rotation.set(...obamaPrismRotation);
  mesh.scale.setScalar(exportRender ? obamaPrismExportScale : obamaPrismDisplayScale);
}

function createDistyloidGeometry() {
  const depth = 0.58;
  const leftSlash = [
    new THREE.Vector2(-1.16, 1.32),
    new THREE.Vector2(-0.56, 1.32),
    new THREE.Vector2(0.22, -0.86),
    new THREE.Vector2(-0.2, -0.86),
  ];
  const rightChevron = [
    new THREE.Vector2(-0.24, 1.32),
    new THREE.Vector2(1.58, 1.32),
    new THREE.Vector2(0.42, -0.86),
    new THREE.Vector2(0.2, -0.4),
    new THREE.Vector2(0.72, 0.74),
    new THREE.Vector2(0.02, 0.74),
  ];

  const geometry = mergeGeometries([
    createExtrudedPolygonGeometry(leftSlash, depth),
    createExtrudedPolygonGeometry(rightChevron, depth),
  ]);
  geometry.rotateY(-0.08);
  geometry.computeVertexNormals();
  return applyCylindricalWrapUvs(geometry);
}

function createExtrudedPolygonGeometry(points: THREE.Vector2[], depth: number) {
  const vertices: number[] = [];
  const triangles = THREE.ShapeUtils.triangulateShape(points, []);
  const frontZ = depth / 2;
  const backZ = -depth / 2;

  function pushVertex(point: THREE.Vector2, z: number) {
    vertices.push(point.x, point.y, z);
  }

  triangles.forEach(([a, b, c]) => {
    pushVertex(points[a], frontZ);
    pushVertex(points[b], frontZ);
    pushVertex(points[c], frontZ);
    pushVertex(points[c], backZ);
    pushVertex(points[b], backZ);
    pushVertex(points[a], backZ);
  });

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    pushVertex(point, frontZ);
    pushVertex(next, frontZ);
    pushVertex(next, backZ);
    pushVertex(point, frontZ);
    pushVertex(next, backZ);
    pushVertex(point, backZ);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function mergeGeometries(geometries: THREE.BufferGeometry[]) {
  const positions: number[] = [];

  geometries.forEach((geometry) => {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = nonIndexed.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
    }
    if (nonIndexed !== geometry) {
      nonIndexed.dispose();
    }
    geometry.dispose();
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

function createPyramidGeometry() {
  const apexY = 1.28;
  const baseY = -0.96;
  const base = 1.74;
  const vertices = new Float32Array([
    0, apexY, 0,
    -base, baseY, base,
    base, baseY, base,

    0, apexY, 0,
    base, baseY, base,
    base, baseY, -base,

    0, apexY, 0,
    base, baseY, -base,
    -base, baseY, -base,

    0, apexY, 0,
    -base, baseY, -base,
    -base, baseY, base,

    -base, baseY, -base,
    base, baseY, -base,
    base, baseY, base,
    -base, baseY, -base,
    base, baseY, base,
    -base, baseY, base,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return applyCylindricalWrapUvs(geometry);
}

function applyCylindricalWrapUvs(sourceGeometry: THREE.BufferGeometry) {
  const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
  const position = geometry.getAttribute("position");
  const vertexCount = position.count;
  const uvs = new Float32Array(vertexCount * 2);

  geometry.computeBoundingBox();
  const minY = geometry.boundingBox?.min.y ?? -1;
  const maxY = geometry.boundingBox?.max.y ?? 1;
  const height = Math.max(0.0001, maxY - minY);

  for (let index = 0; index < vertexCount; index += 3) {
    const points = [0, 1, 2].map((corner) => {
      const vertexIndex = index + corner;
      const x = position.getX(vertexIndex);
      const y = position.getY(vertexIndex);
      const z = position.getZ(vertexIndex);
      const radius = Math.hypot(x, z);
      return {
        radius,
        u: angleToTextureU(Math.atan2(z, x)),
        v: (y - minY) / height,
      };
    });

    const faceU =
      points.reduce((sum, point) => sum + (point.radius > 0.0001 ? point.u : 0), 0) /
      Math.max(1, points.filter((point) => point.radius > 0.0001).length);
    const rawUs = points.map((point) => (point.radius > 0.0001 ? point.u : faceU));
    const unwrappedUs = unwrapFaceSeam(rawUs);

    unwrappedUs.forEach((u, corner) => {
      const uvIndex = (index + corner) * 2;
      uvs[uvIndex] = u;
      uvs[uvIndex + 1] = points[corner].v;
    });
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

function angleToTextureU(angle: number) {
  return (angle + Math.PI) / (Math.PI * 2);
}

function unwrapFaceSeam(us: number[]) {
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  if (maxU - minU <= 0.5) {
    return us;
  }

  return us.map((u) => (u < 0.5 ? u + 1 : u));
}

function applyTextureTransform(texture: THREE.Texture | null, controls: TextureControls) {
  if (!texture) {
    return;
  }

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.repeat.set(1 / controls.scale, 1 / controls.scale);
  texture.offset.set(controls.offsetX, controls.offsetY);
  texture.rotation = THREE.MathUtils.degToRad(controls.rotation);
  texture.needsUpdate = true;
}

function createPlaceholderTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = placeholderTextureSize;
  canvas.height = placeholderTextureSize;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createLinearGradient(0, 0, placeholderTextureSize, placeholderTextureSize);
  gradient.addColorStop(0, "#f06332");
  gradient.addColorStop(0.48, "#f2d9bd");
  gradient.addColorStop(1, "#1f7f78");
  context.fillStyle = gradient;
  context.fillRect(0, 0, placeholderTextureSize, placeholderTextureSize);

  context.fillStyle = "rgba(20, 24, 34, 0.24)";
  for (let y = 0; y < placeholderTextureSize; y += 96) {
    context.fillRect(0, y, placeholderTextureSize, 1);
  }
  for (let x = 0; x < placeholderTextureSize; x += 96) {
    context.fillRect(x, 0, 1, placeholderTextureSize);
  }

  context.fillStyle = "#161b24";
  context.font = "700 72px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("UPLOAD", placeholderTextureSize / 2, placeholderTextureSize / 2 - 42);
  context.fillText("FACE", placeholderTextureSize / 2, placeholderTextureSize / 2 + 42);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createVaporwaveScene(): VaporwaveScene {
  const group = new THREE.Group();
  group.renderOrder = -10;

  return {
    group,
    update: () => {},
    dispose: () => {},
  };
}

function disposeMesh(mesh: THREE.Mesh, disposeTexture = true) {
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    const mappedMaterial = material as THREE.Material & { map?: THREE.Texture | null };
    if (disposeTexture && mappedMaterial.map) {
      mappedMaterial.map.dispose();
    }
    material.dispose();
  });
}

function wrapTextureOffset(value: number) {
  if (value > 1 || value < -1) {
    return ((((value + 1) % 2) + 2) % 2) - 1;
  }
  return value;
}

function isBackgroundSceneTest() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("scene") === "background";
}
