import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type EditorApi } from '../shared/api';

/** Listens to a message from the main process and returns a function that stops listening. Only the data is passed on, never the event. */
function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: EditorApi = {
  loadSchema: () => ipcRenderer.invoke(IPC.loadSchema),
  openYaml: () => ipcRenderer.invoke(IPC.openYaml),
  saveYaml: (request) => ipcRenderer.invoke(IPC.saveYaml, request),
  saveYamlFolder: (files) => ipcRenderer.invoke(IPC.saveYamlFolder, files),
  countChecks: (request) => ipcRenderer.invoke(IPC.countChecks, request),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  pickArchipelagoFolder: () => ipcRenderer.invoke(IPC.pickArchipelagoFolder),
  pickPythonFile: () => ipcRenderer.invoke(IPC.pickPythonFile),
  generatorStatus: () => ipcRenderer.invoke(IPC.generatorStatus),
  generate: (request) => ipcRenderer.invoke(IPC.generate, request),
  cancelGenerate: () => ipcRenderer.invoke(IPC.cancelGenerate),
  pickPlayerYamls: () => ipcRenderer.invoke(IPC.pickPlayerYamls),
  revealSeed: (path) => ipcRenderer.invoke(IPC.revealSeed, path),
  openHelperWindow: () => ipcRenderer.invoke(IPC.openHelperWindow),
  closeHelperWindow: () => ipcRenderer.invoke(IPC.closeHelperWindow),
  isHelperWindowOpen: () => ipcRenderer.invoke(IPC.isHelperWindowOpen),
  publishHelper: (snapshot) => ipcRenderer.invoke(IPC.publishHelper, snapshot),
  getHelperSnapshot: () => ipcRenderer.invoke(IPC.getHelperSnapshot),
  sendHelperAction: (action) => ipcRenderer.invoke(IPC.sendHelperAction, action),
  onHelperSnapshot: (listener) => listen(IPC.helperSnapshotEvent, listener),
  onHelperAction: (listener) => listen(IPC.helperActionEvent, listener),
  onHelperWindow: (listener) => listen(IPC.helperWindowEvent, listener),
  recentFiles: () => ipcRenderer.invoke(IPC.recentFiles),
  openRecent: (path) => ipcRenderer.invoke(IPC.openRecent, path),
  clearRecent: () => ipcRenderer.invoke(IPC.clearRecent),
  loadPresets: () => ipcRenderer.invoke(IPC.loadPresets),
  savePresets: (state) => ipcRenderer.invoke(IPC.savePresets, state),
  customWorldsStatus: () => ipcRenderer.invoke(IPC.customWorldsStatus),
  pickCustomWorlds: () => ipcRenderer.invoke(IPC.pickCustomWorlds),
  scanCustomWorlds: () => ipcRenderer.invoke(IPC.scanCustomWorlds),
  cancelScan: () => ipcRenderer.invoke(IPC.cancelScan),
  hostFiles: () => ipcRenderer.invoke(IPC.hostFiles),
  readHost: (id) => ipcRenderer.invoke(IPC.readHost, id),
  writeHost: (request) => ipcRenderer.invoke(IPC.writeHost, request),
  checkHostPaths: (id, values) => ipcRenderer.invoke(IPC.checkHostPaths, id, values),
  pickHostPath: (kind) => ipcRenderer.invoke(IPC.pickHostPath, kind),
  helperStatus: () => ipcRenderer.invoke(IPC.helperStatus),
  askHelper: (request) => ipcRenderer.invoke(IPC.askHelper, request),
  setOpenRouterKey: (key) => ipcRenderer.invoke(IPC.setOpenRouterKey, key),
  loadRecommender: () => ipcRenderer.invoke(IPC.loadRecommender),
  saveRecommender: (state) => ipcRenderer.invoke(IPC.saveRecommender, state),
};

contextBridge.exposeInMainWorld('api', api);
