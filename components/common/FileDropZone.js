"use client";

// 눌러서 고르거나, 파일을 끌어다 놓아 올리는 상자. 끌고 들어오면 테두리가 밝아집니다.
// kind: FileKind(받을 종류), multiple: 여러 개 받기, onFiles(files), onReject(files): 종류가 안 맞는 파일.

import { useState } from "react";
import { FileDrop } from "@/lib/fileDrop";

export default function FileDropZone({
  kind,
  multiple = false,
  disabled = false,
  onFiles,
  onReject = () => {},
  className = "",
  activeClassName = "border-night-500 bg-night-50",
  children,
}) {
  const [isOver, setIsOver] = useState(false);

  function deliver(fileList) {
    const { accepted, rejected } = FileDrop.split(fileList, kind);
    const picked = multiple ? accepted : accepted.slice(0, 1);
    if (rejected.length > 0) onReject(rejected);
    if (picked.length > 0) onFiles(picked);
  }

  function handleDragOver(e) {
    if (disabled || !FileDrop.carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isOver) setIsOver(true);
  }

  function handleDragLeave(e) {
    // 상자 안쪽 요소로 옮겨갈 때도 dragleave가 와서, 상자 밖으로 나갈 때만 끕니다.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsOver(false);
  }

  function handleDrop(e) {
    if (disabled || !FileDrop.carriesFiles(e)) return;
    e.preventDefault();
    setIsOver(false);
    deliver(e.dataTransfer.files);
  }

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-disabled={disabled || undefined}
      className={`${className} ${isOver ? activeClassName : ""} ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
    >
      {children}
      <input
        type="file"
        accept={kind?.accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          deliver(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
