// path: electron/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Campaigns
  getCampaigns:    ()              => ipcRenderer.invoke('campaigns:get-all'),
  getCampaign:     (id: number)   => ipcRenderer.invoke('campaigns:get', id),
  createCampaign:  (data: any)    => ipcRenderer.invoke('campaigns:create', data),
  updateCampaign:  (id: number, data: any) => ipcRenderer.invoke('campaigns:update', id, data),
  deleteCampaign:  (id: number)   => ipcRenderer.invoke('campaigns:delete', id),

  // Sessions
  getSessions:     (campaignId: number) => ipcRenderer.invoke('sessions:get-all', campaignId),
  createSession:   (data: any)    => ipcRenderer.invoke('sessions:create', data),
  updateSession:   (id: number, data: any) => ipcRenderer.invoke('sessions:update', id, data),
  deleteSession:   (id: number)   => ipcRenderer.invoke('sessions:delete', id),

  // Arcs
  getArcs:    (campaignId: number)          => ipcRenderer.invoke('arcs:get-all', campaignId),
  createArc:  (data: any)                   => ipcRenderer.invoke('arcs:create', data),
  updateArc:  (id: number, data: any)       => ipcRenderer.invoke('arcs:update', id, data),
  deleteArc:  (id: number)                  => ipcRenderer.invoke('arcs:delete', id),

  // Maps
  getMaps:         (sessionId: number) => ipcRenderer.invoke('maps:get-all', sessionId),
  createMap:       (data: any)    => ipcRenderer.invoke('maps:create', data),
  updateMap:       (id: number, data: any) => ipcRenderer.invoke('maps:update', id, data),
  deleteMap:       (id: number)   => ipcRenderer.invoke('maps:delete', id),
  importMapImage:  (sessionId: number) => ipcRenderer.invoke('maps:import-image', sessionId),

  // POIs
  getPOIs:         (mapId: number) => ipcRenderer.invoke('pois:get-all', mapId),
  createPOI:       (data: any)    => ipcRenderer.invoke('pois:create', data),
  updatePOI:       (id: number, data: any) => ipcRenderer.invoke('pois:update', id, data),
  deletePOI:       (id: number)   => ipcRenderer.invoke('pois:delete', id),

  // Articles — full rows
  getArticles:         (filter?: any)  => ipcRenderer.invoke('articles:get-all', filter),
  // Articles — lean rows
  getArticlesList:     (filter?: any)  => ipcRenderer.invoke('articles:get-list', filter),
  getArticle:          (id: number)    => ipcRenderer.invoke('articles:get', id),
  getArticleByTitle:   (title: string, campaignId: number) =>
                         ipcRenderer.invoke('articles:get-by-title', title, campaignId),
  getArticleBacklinks: (title: string, campaignId: number) =>
                         ipcRenderer.invoke('articles:get-backlinks', title, campaignId),
  createArticle:       (data: any)     => ipcRenderer.invoke('articles:create', data),
  updateArticle:       (id: number, data: any) => ipcRenderer.invoke('articles:update', id, data),
  deleteArticle:       (id: number)    => ipcRenderer.invoke('articles:delete', id),

  // Combat
  getCombatEncounter:  (poiId: number)       => ipcRenderer.invoke('combat:get-encounter', poiId),
  getCombatCreatures:  (encounterId: number)  => ipcRenderer.invoke('combat:get-creatures', encounterId),
  addCombatCreature:   (encounterId: number, articleId: number, maxHp: number) =>
                         ipcRenderer.invoke('combat:add-creature', encounterId, articleId, maxHp),
  saveCombatCreatures: (creatures: any[])     => ipcRenderer.invoke('combat:save-creatures', creatures),
  saveLootResult:      (creatureId: number, lootResult: any[]) => ipcRenderer.invoke('combat:save-loot-result', creatureId, lootResult),
  getLootResults:      (encounterId: number)  => ipcRenderer.invoke('combat:get-loot-results', encounterId),
  openStatBlockWindow: (articleId: number)    => ipcRenderer.invoke('statblock:open-window', articleId),

  // Files
  selectImageFile: () => ipcRenderer.invoke('file:select-image'),
  getImagePath:    (relativePath: string) => ipcRenderer.invoke('file:get-image-path', relativePath),

  // Backup
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),

  // Updates
  checkForUpdates:    ()         => ipcRenderer.invoke('updater:check'),
  installUpdate:      ()         => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable:  (cb: (info: { version: string }) => void) =>
                        ipcRenderer.on('updater:available', (_e, info) => cb(info)),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
                        ipcRenderer.on('updater:downloaded', (_e, info) => cb(info)),

  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  // DM Notes — pages
  getDMNotesPages:    (campaignId: number) =>
                        ipcRenderer.invoke('dm-notes:get-all', campaignId),
  getDMNotePage:      (id: number) =>
                        ipcRenderer.invoke('dm-notes:get', id),
  createDMNotePage:   (campaignId: number, groupId?: number | null) =>
                        ipcRenderer.invoke('dm-notes:create', campaignId, groupId ?? null),
  updateDMNotePage:   (id: number, data: any) =>
                        ipcRenderer.invoke('dm-notes:update', id, data),
  deleteDMNotePage:   (id: number) =>
                        ipcRenderer.invoke('dm-notes:delete', id),
  reorderDMNotePages: (orders: any[]) =>
                        ipcRenderer.invoke('dm-notes:reorder-pages', orders),

  // DM Notes — groups
  getDMNoteGroups:     (campaignId: number) =>
                         ipcRenderer.invoke('dm-notes:get-groups', campaignId),
  createDMNoteGroup:   (campaignId: number, name: string, color: string) =>
                         ipcRenderer.invoke('dm-notes:create-group', campaignId, name, color),
  updateDMNoteGroup:   (id: number, data: any) =>
                         ipcRenderer.invoke('dm-notes:update-group', id, data),
  deleteDMNoteGroup:   (id: number) =>
                         ipcRenderer.invoke('dm-notes:delete-group', id),
  reorderDMNoteGroups: (orders: any[]) =>
                         ipcRenderer.invoke('dm-notes:reorder-groups', orders),

  // Master Loot Tables
  getLootTables:      (campaignId: number) =>
                        ipcRenderer.invoke('loot-tables:get-all', campaignId),
  getLootTable:       (id: number) =>
                        ipcRenderer.invoke('loot-tables:get', id),
  createLootTable:    (data: any) =>
                        ipcRenderer.invoke('loot-tables:create', data),
  updateLootTable:    (id: number, data: any) =>
                        ipcRenderer.invoke('loot-tables:update', id, data),
  deleteLootTable:    (id: number) =>
                        ipcRenderer.invoke('loot-tables:delete', id),
  rollLootTable:      (tableId: number, extraItemsJson: string) =>
                        ipcRenderer.invoke('loot-tables:roll', tableId, extraItemsJson),
  resetDefaultTables: (campaignId: number) =>
                        ipcRenderer.invoke('loot-tables:reset-defaults', campaignId),
})