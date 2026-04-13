"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // Campaigns
  getCampaigns: () => electron.ipcRenderer.invoke("campaigns:get-all"),
  getCampaign: (id) => electron.ipcRenderer.invoke("campaigns:get", id),
  createCampaign: (data) => electron.ipcRenderer.invoke("campaigns:create", data),
  updateCampaign: (id, data) => electron.ipcRenderer.invoke("campaigns:update", id, data),
  deleteCampaign: (id) => electron.ipcRenderer.invoke("campaigns:delete", id),
  // Sessions
  getSessions: (campaignId) => electron.ipcRenderer.invoke("sessions:get-all", campaignId),
  createSession: (data) => electron.ipcRenderer.invoke("sessions:create", data),
  updateSession: (id, data) => electron.ipcRenderer.invoke("sessions:update", id, data),
  deleteSession: (id) => electron.ipcRenderer.invoke("sessions:delete", id),
  // Arcs
  getArcs: (campaignId) => electron.ipcRenderer.invoke("arcs:get-all", campaignId),
  createArc: (data) => electron.ipcRenderer.invoke("arcs:create", data),
  updateArc: (id, data) => electron.ipcRenderer.invoke("arcs:update", id, data),
  deleteArc: (id) => electron.ipcRenderer.invoke("arcs:delete", id),
  // Maps
  getMaps: (sessionId) => electron.ipcRenderer.invoke("maps:get-all", sessionId),
  createMap: (data) => electron.ipcRenderer.invoke("maps:create", data),
  updateMap: (id, data) => electron.ipcRenderer.invoke("maps:update", id, data),
  deleteMap: (id) => electron.ipcRenderer.invoke("maps:delete", id),
  importMapImage: (sessionId) => electron.ipcRenderer.invoke("maps:import-image", sessionId),
  // POIs
  getPOIs: (mapId) => electron.ipcRenderer.invoke("pois:get-all", mapId),
  createPOI: (data) => electron.ipcRenderer.invoke("pois:create", data),
  updatePOI: (id, data) => electron.ipcRenderer.invoke("pois:update", id, data),
  deletePOI: (id) => electron.ipcRenderer.invoke("pois:delete", id),
  // Articles — full rows (use for opening individual articles in the editor)
  getArticles: (filter) => electron.ipcRenderer.invoke("articles:get-all", filter),
  // Articles — lean rows (use for list/grid views and wiki-link checks; no content blob)
  getArticlesList: (filter) => electron.ipcRenderer.invoke("articles:get-list", filter),
  getArticle: (id) => electron.ipcRenderer.invoke("articles:get", id),
  getArticleByTitle: (title, campaignId) => electron.ipcRenderer.invoke("articles:get-by-title", title, campaignId),
  getArticleBacklinks: (title, campaignId) => electron.ipcRenderer.invoke("articles:get-backlinks", title, campaignId),
  createArticle: (data) => electron.ipcRenderer.invoke("articles:create", data),
  updateArticle: (id, data) => electron.ipcRenderer.invoke("articles:update", id, data),
  deleteArticle: (id) => electron.ipcRenderer.invoke("articles:delete", id),
  // Combat
  getCombatEncounter: (poiId) => electron.ipcRenderer.invoke("combat:get-encounter", poiId),
  getCombatCreatures: (encounterId) => electron.ipcRenderer.invoke("combat:get-creatures", encounterId),
  addCombatCreature: (encounterId, articleId, maxHp) => electron.ipcRenderer.invoke("combat:add-creature", encounterId, articleId, maxHp),
  saveCombatCreatures: (creatures) => electron.ipcRenderer.invoke("combat:save-creatures", creatures),
  saveLootResult: (creatureId, lootResult) => electron.ipcRenderer.invoke("combat:save-loot-result", creatureId, lootResult),
  getLootResults: (encounterId) => electron.ipcRenderer.invoke("combat:get-loot-results", encounterId),
  openStatBlockWindow: (articleId) => electron.ipcRenderer.invoke("statblock:open-window", articleId),
  // Files
  selectImageFile: () => electron.ipcRenderer.invoke("file:select-image"),
  getImagePath: (relativePath) => electron.ipcRenderer.invoke("file:get-image-path", relativePath),
  // Backup
  exportBackup: () => electron.ipcRenderer.invoke("backup:export"),
  importBackup: () => electron.ipcRenderer.invoke("backup:import")
});
