"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent, ReactNode } from "react";
// React95 9.8.0 ships its built files under dist while the root export points at absent paths.
// @ts-expect-error - the dist ESM files do not ship ambient TypeScript module declarations.
import { Frame } from "../node_modules/@react95/core/dist/esm/Frame/Frame.mjs";
// @ts-expect-error - the dist ESM files do not ship ambient TypeScript module declarations.
import { TitleBar } from "../node_modules/@react95/core/dist/esm/TitleBar/TitleBar.mjs";
import {
  Box,
  Download,
  FileImage,
  ImagePlus,
  Move,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ExportBackground, PrismViewport, ShapeKind, TextureControls } from "@/components/prism-viewport";

const shapeOptions: Array<{ value: ShapeKind; label: string }> = [
  { value: "cube", label: "cube" },
  { value: "distyloid", label: "distyloid" },
  { value: "dodecahedron", label: "dodecahedron" },
  { value: "pyramid", label: "pyramid" },
  { value: "sphere", label: "sphere" },
  { value: "tetrahedron", label: "tetrahedron" },
];

const defaultControls: TextureControls = {
  offsetX: -0.22,
  offsetY: -0.02,
  scale: 1.05,
  rotation: 0,
};

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("no image loaded");
  const [shape, setShape] = useState<ShapeKind>("pyramid");
  const [controls, setControls] = useState<TextureControls>(defaultControls);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<((background: ExportBackground) => string | null) | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const loadImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      return;
    }

    setImageUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
    setFileName(file.name || "pasted image");
  }, []);

  useEffect(() => {
    function handleDocumentPaste(event: globalThis.ClipboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      const file = getImageFromClipboard(event.clipboardData);
      if (!file) {
        return;
      }

      event.preventDefault();
      loadImageFile(file);
    }

    window.addEventListener("paste", handleDocumentPaste);
    return () => window.removeEventListener("paste", handleDocumentPaste);
  }, [loadImageFile]);

  const transformReadout = useMemo(
    () =>
      `x ${controls.offsetX.toFixed(2)} / y ${controls.offsetY.toFixed(2)} / zoom ${controls.scale.toFixed(2)}x`,
    [controls],
  );

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    loadImageFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDropActive(false);
    const file = getImageFromFileList(event.dataTransfer.files);
    if (file) {
      loadImageFile(file);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLButtonElement>) {
    const file = getImageFromClipboard(event.clipboardData);
    if (!file) {
      return;
    }

    event.preventDefault();
    loadImageFile(file);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    fileInputRef.current?.click();
  }

  function updateControl<Key extends keyof TextureControls>(key: Key, value: TextureControls[Key]) {
    setControls((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    setControls(defaultControls);
  }

  function handleDownload(background: ExportBackground) {
    const dataUrl = captureRef.current?.(background);
    if (!dataUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `obama-prism-${shape}-${background}.png`;
    link.click();
  }

  const handleCaptureReady = useCallback((capture: (background: ExportBackground) => string | null) => {
    captureRef.current = capture;
  }, []);

  return (
    <main className="win95-desktop min-h-screen overflow-x-hidden overflow-y-auto p-3 pb-12 text-card-foreground">
      <div className="pointer-events-none fixed left-4 top-5 z-0 hidden w-20 flex-col gap-6 md:flex">
        <DesktopIcon label="Prism.exe">
          <Sparkles className="size-8 text-primary" aria-hidden="true" />
        </DesktopIcon>
        <DesktopIcon label="Faces">
          <FileImage className="size-8 text-secondary" aria-hidden="true" />
        </DesktopIcon>
      </div>

      <Frame className="win95-window relative z-10 mx-auto flex h-[calc(100vh-54px)] min-h-[760px] w-full max-w-[1540px] flex-col overflow-hidden p-1">
        <TitleBar
          active
          className="win95-titlebar"
          icon={
            <span className="win95-title-icon">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
          }
          title="PRISM.EXE - it's prism day"
        >
          <TitleBar.OptionsBox>
            <TitleBar.Minimize aria-label="Minimize" />
            <TitleBar.Maximize aria-label="Maximize" />
            <TitleBar.Close aria-label="Close" />
          </TitleBar.OptionsBox>
        </TitleBar>

        <nav className="win95-menu" aria-label="Application menu">
          {["File", "Edit", "View", "Image", "Export", "Help"].map((item) => (
            <button key={item} type="button">
              {item}
            </button>
          ))}
        </nav>

        <div className="win95-client grid min-h-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b-2 border-border p-3 lg:border-b-0 lg:border-r-2">
            <div className="flex min-h-full flex-col gap-4">
              <div className="win95-inset flex items-center gap-3 px-3 py-2">
                <div className="win95-panel flex size-10 items-center justify-center bg-card">
                  <Sparkles className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-[17px] font-bold leading-tight">Prism Day</h1>
                  <p className="truncate text-[12px] text-primary-foreground">become one with the prism</p>
                </div>
              </div>

              <Separator />

              <fieldset className="win95-fieldset space-y-3">
                <legend>Source Image</legend>
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                />
                <button
                  className="win95-dropzone w-full"
                  data-active={isDropActive}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDropActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDropActive(false)}
                  onDrop={handleDrop}
                  onKeyDown={handleDropzoneKeyDown}
                  onPaste={handlePaste}
                >
                  <span className="win95-dropzone-icon">
                    <ImagePlus aria-hidden="true" />
                  </span>
                  <span className="font-bold">embrace greatness</span>
                  <span className="text-[11px] text-muted-foreground">click / drop / paste</span>
                </button>
                <div className="win95-inset truncate px-3 py-2 text-[12px]">
                  {fileName}
                </div>
              </fieldset>

              <fieldset className="win95-fieldset space-y-3">
                <legend>Solid</legend>
                <Select value={shape} onValueChange={(value) => setShape(value as ShapeKind)}>
                  <SelectTrigger id="shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {shapeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </fieldset>

              <fieldset className="win95-fieldset space-y-4">
                <legend>Projection</legend>
                <div className="win95-inset px-3 py-2 text-[12px] leading-relaxed">{transformReadout}</div>

                <ControlSlider
                  label="horizontal"
                  value={controls.offsetX}
                  min={-1}
                  max={1}
                  step={0.01}
                  onValueChange={(value) => updateControl("offsetX", value)}
                />
                <ControlSlider
                  label="vertical"
                  value={controls.offsetY}
                  min={-1}
                  max={1}
                  step={0.01}
                  onValueChange={(value) => updateControl("offsetY", value)}
                />
                <ControlSlider
                  label="zoom"
                  value={controls.scale}
                  min={0.45}
                  max={3}
                  step={0.01}
                  onValueChange={(value) => updateControl("scale", value)}
                />
                <ControlSlider
                  label="spin"
                  value={controls.rotation}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={(value) => updateControl("rotation", value)}
                />
              </fieldset>

              <fieldset className="win95-fieldset space-y-3">
                <legend>Export</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={() => handleDownload("white")}>
                    <FileImage aria-hidden="true" />
                    white bg
                  </Button>
                  <Button type="button" variant="outline" onClick={() => handleDownload("transparent")}>
                    <Download aria-hidden="true" />
                    alpha
                  </Button>
                </div>
              </fieldset>

              <div className="mt-auto grid grid-cols-2 gap-2">
                <Button variant="outline" size="icon" onClick={() => setAutoRotate((value) => !value)} title="Toggle auto rotate">
                  {autoRotate ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </Button>
                <Button variant="outline" size="icon" onClick={handleReset} title="Reset projection">
                  <RotateCcw aria-hidden="true" />
                </Button>
              </div>
            </div>
          </aside>

          <section className="relative min-h-[620px] min-w-0 overflow-hidden p-3">
            <div className="win95-viewport-frame relative h-full min-h-[620px] overflow-hidden">
              <div className="win95-panel absolute left-3 top-3 z-10 flex items-center gap-2 bg-card px-3 py-1.5 text-[12px]">
                <Move className="size-4 text-primary" aria-hidden="true" />
                drag surface to move image
              </div>
              <div className="win95-panel absolute right-3 top-3 z-10 hidden items-center gap-2 bg-card px-3 py-1.5 text-[12px] md:flex">
                <Box className="size-4 text-secondary" aria-hidden="true" />
                {shape}
              </div>
              <PrismViewport
                autoRotate={autoRotate}
                controls={controls}
                imageUrl={imageUrl}
                shape={shape}
                onCaptureReady={handleCaptureReady}
                onControlsChange={setControls}
              />
            </div>
          </section>
        </div>

        <div className="win95-statusbar">
          <span>Ready</span>
          <span>{shape}</span>
          <span>{fileName}</span>
        </div>
      </Frame>

      <div className="win95-taskbar fixed inset-x-0 bottom-0 z-20 flex h-10 items-center gap-2 px-2">
        <button className="win95-task-button flex h-8 items-center gap-2 px-3 font-bold" type="button">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Start
        </button>
        <button className="win95-task-button hidden h-8 min-w-40 items-center gap-2 px-3 text-left md:flex" data-active="true" type="button">
          <span className="win95-title-icon">
            <Sparkles className="size-3.5" aria-hidden="true" />
          </span>
          PRISM.EXE
        </button>
        <div className="ml-auto win95-inset px-3 py-1 text-[12px] text-primary-foreground">PRISM DAY</div>
      </div>
    </main>
  );
}

function getImageFromFileList(files: FileList) {
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}

function getImageFromClipboard(data: DataTransfer | null) {
  if (!data) {
    return null;
  }

  for (const item of Array.from(data.items)) {
    if (!item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  return getImageFromFileList(data.files);
}

function DesktopIcon({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="win95-desktop-icon flex flex-col items-center gap-1 text-center text-[12px]">
      <div className="win95-inset flex size-12 items-center justify-center">{children}</div>
      <span>{label}</span>
    </div>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{value.toFixed(step >= 1 ? 0 : 2)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onValueChange(next)}
      />
    </div>
  );
}
