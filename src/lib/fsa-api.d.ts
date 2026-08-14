// Ambient additions for the File System Access API (Phase 5). The DOM lib
// shipped with TypeScript 5.5 declares FileSystemFileHandle (kind/getFile/
// createWritable) but is missing the permission methods and the picker entry
// points, which landed in later TS versions. These match the current Chrome
// API surface (Chrome 86+, well under the extension's 114+ floor) and are
// scoped to exactly what lib/fsa.ts uses — nothing broader.

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  readonly name: string;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
