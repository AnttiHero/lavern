/**
 * coworkStore — Module-level singleton for FileSystemDirectoryHandle.
 *
 * FileSystemDirectoryHandle cannot be serialized to sessionStorage,
 * so we hold it in module scope for the tab's lifetime. React components
 * subscribe via useSyncExternalStore.
 *
 * Permission model matches the browser's: handle is valid for the tab
 * session only. On page refresh, it's lost — which is correct.
 */

/// <reference path="./file-system-access.d.ts" />

// ── Types ──────────────────────────────────────────────────────────────

export interface CoworkFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  selected: boolean;
  handle: FileSystemFileHandle;
}

export type CoworkStatus = 'disconnected' | 'connected' | 'reading' | 'processing' | 'delivered';

export interface CoworkState {
  status: CoworkStatus;
  folderName: string | null;
  handle: FileSystemDirectoryHandle | null;
  files: CoworkFile[];
}

// ── State ──────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.html',
]);

const MAX_FILES = 50;

let state: CoworkState = {
  status: 'disconnected',
  folderName: null,
  handle: null,
  files: [],
};

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

// ── Public API ─────────────────────────────────────────────────────────

export function getCoworkState(): CoworkState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function setDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  state = { ...state, status: 'reading', folderName: handle.name, handle, files: [] };
  notify();

  // Read entries (shallow, no recursion)
  const files: CoworkFile[] = [];
  try {
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file') continue;

      const ext = entry.name.includes('.')
        ? '.' + entry.name.split('.').pop()!.toLowerCase()
        : '';
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      const file = await entry.getFile();
      files.push({
        name: file.name,
        size: file.size,
        type: file.type || ext,
        lastModified: file.lastModified,
        selected: true, // all selected by default
        handle: entry as FileSystemFileHandle,
      });

      if (files.length >= MAX_FILES) break;
    }
  } catch (err) {
    console.error('[cowork] Failed to read directory:', err);
  }

  // Sort by name
  files.sort((a, b) => a.name.localeCompare(b.name));

  state = { ...state, status: 'connected', files };
  notify();
}

export function clearDirectoryHandle(): void {
  state = { status: 'disconnected', folderName: null, handle: null, files: [] };
  notify();
}

export function setFileSelected(name: string, selected: boolean): void {
  state = {
    ...state,
    files: state.files.map(f =>
      f.name === name ? { ...f, selected } : f
    ),
  };
  notify();
}

export function setCoworkStatus(status: CoworkStatus): void {
  state = { ...state, status };
  notify();
}
