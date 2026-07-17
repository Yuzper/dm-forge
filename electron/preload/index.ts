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
  getSessions:        (campaignId: number) => ipcRenderer.invoke('sessions:get-all', campaignId),
  getSessionPoiTexts: (campaignId: number) => ipcRenderer.invoke('sessions:get-poi-texts', campaignId),
  createSession:   (data: any)    => ipcRenderer.invoke('sessions:create', data),
  updateSession:   (id: number, data: any) => ipcRenderer.invoke('sessions:update', id, data),
  deleteSession:   (id: number)   => ipcRenderer.invoke('sessions:delete', id),
  promoteSession:  (id: number)   => ipcRenderer.invoke('sessions:promote', id),
  reorderDrafts:   (orders: { id: number; sort_order: number }[]) => ipcRenderer.invoke('sessions:reorder-drafts', orders),

  // Arcs
  getArcs:    (campaignId: number)          => ipcRenderer.invoke('arcs:get-all', campaignId),
  createArc:  (data: any)                   => ipcRenderer.invoke('arcs:create', data),
  updateArc:  (id: number, data: any)       => ipcRenderer.invoke('arcs:update', id, data),
  deleteArc:  (id: number)                  => ipcRenderer.invoke('arcs:delete', id),
  reorderArcs:(orders: { id: number; sort_order: number }[]) => ipcRenderer.invoke('arcs:reorder', orders),

  // Maps
  getMaps:            (sessionId: number)  => ipcRenderer.invoke('maps:get-all', sessionId),
  getMapsForArticle:  (articleId: number)  => ipcRenderer.invoke('maps:get-by-article', articleId),
  createMap:          (data: any)          => ipcRenderer.invoke('maps:create', data),
  updateMap:          (id: number, data: any) => ipcRenderer.invoke('maps:update', id, data),
  reorderMaps:        (orders: { id: number; sort_order: number }[]) => ipcRenderer.invoke('maps:reorder', orders),
  deleteMap:          (id: number)         => ipcRenderer.invoke('maps:delete', id),
  importMapImage:     (sessionId: number)  => ipcRenderer.invoke('maps:import-image', sessionId),
  replaceMapImage:    (...args)            => ipcRenderer.invoke('maps:replace-image', ...args),
  importMapForArticle:(articleId: number)  => ipcRenderer.invoke('maps:import-for-article', articleId),
  getMapsForCampaign:   (campaignId: number) => ipcRenderer.invoke('maps:get-by-campaign', campaignId),
  importMapForCampaign: (campaignId: number) => ipcRenderer.invoke('maps:import-for-campaign', campaignId),

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
  getArticlesHealth:   (campaignId: number) => ipcRenderer.invoke('articles:health', campaignId),
  getArticleLinkGraph: (campaignId: number) => ipcRenderer.invoke('articles:link-graph', campaignId),
  globalSearch:        (campaignId: number, query: string) => ipcRenderer.invoke('search:global', campaignId, query),
  findInPage:          (text: string, opts?: { forward?: boolean; findNext?: boolean }) => ipcRenderer.invoke('find:in-page', text, opts),
  stopFindInPage:      () => ipcRenderer.invoke('find:stop'),
  onFindResult:        (cb: (r: { matches: number; active: number }) => void) =>
                         ipcRenderer.on('find:result', (_e, r) => cb(r)),
  createArticle:       (data: any)     => ipcRenderer.invoke('articles:create', data),
  updateArticle:       (id: number, data: any) => ipcRenderer.invoke('articles:update', id, data),
  deleteArticle:       (id: number)    => ipcRenderer.invoke('articles:delete', id),

  // Combat
  getCombatEncounter:  (poiId: number)       => ipcRenderer.invoke('combat:get-encounter', poiId),
  getCombatCreatures:  (encounterId: number)  => ipcRenderer.invoke('combat:get-creatures', encounterId),
  addCombatCreature: (encounterId: number, articleId: number, maxHp: number, variantData?: any) =>
                                                ipcRenderer.invoke('combat:add-creature', encounterId, articleId, maxHp, variantData),
  saveCombatCreatures: (creatures: any[])     => ipcRenderer.invoke('combat:save-creatures', creatures),
  deleteCombatCreature: (creatureId: number)  => ipcRenderer.invoke('combat:delete-creature', creatureId),
  saveLootResult:      (creatureId: number, lootResult: any[]) => ipcRenderer.invoke('combat:save-loot-result', creatureId, lootResult),
  getLootResults:      (encounterId: number)  => ipcRenderer.invoke('combat:get-loot-results', encounterId),
  openStatBlockWindow: (articleId: number, overrides?: { statblock?: string; name?: string }) =>
                                                ipcRenderer.invoke('statblock:open-window', articleId, overrides),

  // Files
  selectImageFile: () => ipcRenderer.invoke('file:select-image'),
  getImagePath:    (relativePath: string) => ipcRenderer.invoke('file:get-image-path', relativePath),

  // Backup — campaignId scopes the export to one campaign; omit for everything.
  exportBackup: (campaignId?: number | null) => ipcRenderer.invoke('backup:export', campaignId ?? null),
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
  syncDMSessionNotes:  (campaignId: number) =>
                         ipcRenderer.invoke('dm-notes:sync-session-notes', campaignId),
  listCreatureImages:  () =>
                         ipcRenderer.invoke('creatures:list-images'),

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

  // Relation Webs
  getRelationWebs:     (...args) => ipcRenderer.invoke('relation-webs:get-all', ...args),
  createRelationWeb:   (...args) => ipcRenderer.invoke('relation-webs:create', ...args),
  updateRelationWeb:   (...args) => ipcRenderer.invoke('relation-webs:update', ...args),
  deleteRelationWeb:   (...args) => ipcRenderer.invoke('relation-webs:delete', ...args),
  getRelationWebData:  (...args) => ipcRenderer.invoke('relation-webs:get-data', ...args),
  createRelationNode:  (...args) => ipcRenderer.invoke('relation-nodes:create', ...args),
  updateRelationNode:  (...args) => ipcRenderer.invoke('relation-nodes:update', ...args),
  deleteRelationNode:  (...args) => ipcRenderer.invoke('relation-nodes:delete', ...args),
  createRelationEdge:  (...args) => ipcRenderer.invoke('relation-edges:create', ...args),
  updateRelationEdge:  (...args) => ipcRenderer.invoke('relation-edges:update', ...args),
  deleteRelationEdge:  (...args) => ipcRenderer.invoke('relation-edges:delete', ...args),
  getArticleRelations: (...args) => ipcRenderer.invoke('relation-edges:get-for-article', ...args),
  getRelationWebForArticle: (articleId: number) => ipcRenderer.invoke('relation-webs:get-for-article', articleId),
  listRelationWebsForArticle: (articleId: number) => ipcRenderer.invoke('relation-webs:list-for-article', articleId),
  listRelationWebsForMember:  (articleId: number) => ipcRenderer.invoke('relation-webs:list-for-member', articleId),
  getRelationWebArticles:   (webId: number) => ipcRenderer.invoke('relation-webs:get-linked-articles', webId),
  linkRelationWebArticle:   (webId: number, articleId: number) => ipcRenderer.invoke('relation-webs:link-article', webId, articleId),
  unlinkRelationWebArticle: (webId: number, articleId: number) => ipcRenderer.invoke('relation-webs:unlink-article', webId, articleId),
  getArticleMemberCount:    (articleId: number) => ipcRenderer.invoke('articles:member-count', articleId),
  getArticleAffiliations:   (articleId: number) => ipcRenderer.invoke('articles:get-affiliations', articleId),
  getArticleGeography:      (articleId: number) => ipcRenderer.invoke('articles:get-geography', articleId),

  syncDerivedRelations:   (webId: number)  => ipcRenderer.invoke('relation-webs:sync-derived-relations',   webId),

  // Sound Boards
  getSoundBoards:    (campaignId: number)        => ipcRenderer.invoke('soundboards:get-all', campaignId),
  createSoundBoard:  (data: any)                 => ipcRenderer.invoke('soundboards:create', data),
  updateSoundBoard:  (id: number, data: any)     => ipcRenderer.invoke('soundboards:update', id, data),
  deleteSoundBoard:  (id: number)                => ipcRenderer.invoke('soundboards:delete', id),
  getDefaultSounds:  ()                          => ipcRenderer.invoke('soundboards:get-defaults'),

  // Sounds
  getSounds:         (boardId: number)           => ipcRenderer.invoke('sounds:get-all', boardId),
  createSound:       (data: any)                 => ipcRenderer.invoke('sounds:create', data),
  updateSound:       (id: number, data: any)     => ipcRenderer.invoke('sounds:update', id, data),
  deleteSound:       (id: number)                => ipcRenderer.invoke('sounds:delete', id),
  selectAudioFile:   ()                          => ipcRenderer.invoke('sounds:select-file'),
})