// ─────────────────────────────────────────────────────────────────
// FAVOURITES — save/remove models, persist to localStorage, sync UI
// ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nasa3d_favourites'

// ── Persistence ───────────────────────────────────────────────────
export function loadFavourites() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
    catch { return [] }
}

export function saveFavourites(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function isFavourite(modelPath) {
    return loadFavourites().some(f => f.path === modelPath)
}

export function toggleFavourite(model) {
    const favs = loadFavourites()
    const idx  = favs.findIndex(f => f.path === model.path)
    if (idx >= 0) {
        favs.splice(idx, 1)
    } else {
        favs.push({ name: model.name, path: model.path })
    }
    saveFavourites(favs)
    return idx < 0   // returns true if now favourited
}