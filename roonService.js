// roonService.js
import RoonApi from 'node-roon-api';
import RoonApiBrowse from 'node-roon-api-browse';
import RoonApiTransport from 'node-roon-api-transport';
import RoonApiImage from 'node-roon-api-image';
import { app } from 'electron';

let roon = null;
let core = null;
let browse = null;
let transport = null;
let zonesCache = [];
let zonesRaw = [];
let lastNPByZone = Object.create(null);
let genresCache = null;
let genresCacheTime = null;
let playedThisSession = new Set();
let isActionInProgress = false;
let isDeepDiveInProgress = false;


// We will pass the window and store from main.js during initialization
let mainWindow = null;
let store = null;

function emitEvent(payload) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('roon:event', payload);
  }
}

function emitZones() {
  emitEvent({ type: 'zones', zones: zonesCache });
}

function connectToRoon() {
  roon = new RoonApi({
    extension_id: 'com.markmcc.roonrandom',
    display_name: 'Roon Random Album',
    display_version: app.getVersion(),
    publisher: 'Mark McClusky',
    email: 'mark@example.com',
    website: 'https://example.com',
    log_level: 'none',
    token: store.get('token'),
    save_token: (token) => store.set('token', token),

    core_paired: (_core) => {
      core = _core;
      browse = core.services.RoonApiBrowse;
      transport = core.services.RoonApiTransport;

      transport.subscribe_zones((resp, data) => {
        if (resp === 'Subscribed') {
          zonesRaw = Array.isArray(data?.zones) ? data.zones : [];
        } else if (resp === 'Changed') {
          if (Array.isArray(data?.zones)) {
            zonesRaw = data.zones;
          } else if (Array.isArray(data?.zones_changed)) {
            const byId = new Map(zonesRaw.map(z => [z.zone_id, z]));
            data.zones_changed.forEach(z => byId.set(z.zone_id, z));
            zonesRaw = Array.from(byId.values());
          }
        }
        zonesCache = zonesRaw.map(z => ({ id: z.zone_id, name: z.display_name, state: z.state, volume: z.outputs && z.outputs[0] ? z.outputs[0].volume : null }));
        if (!store.get('lastZoneId') && zonesCache.length) {
          store.set('lastZoneId', zonesCache[0].id);
        }
        emitZones();
        const zid = store.get('lastZoneId');
        const np = getZoneNowPlaying(zid);
        if (np) maybeEmitNowPlaying(zid, np);
      });
      emitEvent({ type: 'core', status: 'paired', coreDisplayName: core.display_name });
    },

    core_unpaired: () => {
      emitEvent({ type: 'core', status: 'unpaired' });
      core = null; browse = null; transport = null;
      zonesCache = [];
      emitZones();
    }
  });

  roon.init_services({ required_services: [RoonApiBrowse, RoonApiTransport, RoonApiImage] });
  roon.start_discovery();
}

function browseAsync(opts) { return new Promise((res, rej) => browse.browse(opts, (e, out) => e ? rej(e) : res(out || {}))); }
function loadAsync(opts) { return new Promise((res, rej) => browse.load(opts, (e, out) => e ? rej(e) : res(out || {}))); }

export function getCore() { return core; }
export function getTransport() { return transport; }
export function getZonesCache() { return zonesCache; }
export function getRawZones() { return zonesRaw; }

export function getFilters() { return store.get('filters'); }
export function setFilters(filters) {
  const current = getFilters();
  let nextGenres;
  if (Array.isArray(filters?.genres)) {
    nextGenres = filters.genres.map(s => String(s).trim()).filter(Boolean);
  } else if (filters && Object.prototype.hasOwnProperty.call(filters, 'genres')) {
    nextGenres = [];
  } else {
    nextGenres = Array.isArray(current?.genres) ? current.genres : [];
  }
  const next = { genres: nextGenres };
  store.set('filters', next);
  emitEvent({ type: 'filters', filters: next });
  return next;
}
export function setLastZone(id) { store.set('lastZoneId', id || null); }

export async function listGenres() {
  if (genresCache && (Date.now() - genresCacheTime < 3600 * 1000)) {
    return genresCache;
  }
  if (!browse) throw new Error('Not connected to a Roon Core');

  const open = (item_key) => browseAsync({ hierarchy: 'browse', item_key });
  
  async function loadAll(item_key) {
    const genres = [];
    let offset = 0;
    const albumCountRegex = /(\d+)\s+Albums?$/;

    while (true) {
      const page = await loadAsync({ hierarchy: 'browse', item_key, offset, count: 200 });
      const arr = page.items || [];
      if (!arr.length) break;

      for (const it of arr) {
        if (it?.title && it?.subtitle) {
          const match = it.subtitle.match(albumCountRegex);
          const albumCount = match ? parseInt(match[1], 10) : 0;
          
          // --- THIS IS THE CHANGE ---
          // Only add the genre if it has one or more albums
          if (albumCount > 0) {
            genres.push({
              title: it.title.trim(),
              albumCount: albumCount,
            });
          }
        }
      }
      offset += arr.length;
    }

    // Sort by album count in descending order
    genres.sort((a, b) => b.albumCount - a.albumCount);

    // This block for ensuring uniqueness can stay as is
    const uniqueGenres = [];
    const seenTitles = new Set();
    for (const genre of genres) {
        if (!seenTitles.has(genre.title)) {
            uniqueGenres.push(genre);
            seenTitles.add(genre.title);
        }
    }

    return uniqueGenres;
  }

  // The rest of the function remains the same...
  await browseAsync({ hierarchy: 'browse', pop_all: true });
  const root = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
  const ciFind = (items, text) => {
    const t = String(text).toLowerCase();
    return (items || []).find(i => (i?.title || '').toLowerCase() === t) || (items || []).find(i => (i?.title || '').toLowerCase().includes(t));
  };
  let genresNode = ciFind(root.items, 'Genres') || null;
  if (!genresNode?.item_key) throw new Error('Could not locate Genres in this core.');
  await open(genresNode.item_key);
  const detailedGenres = await loadAll(genresNode.item_key);
  if (!detailedGenres.length) throw new Error('Genres page appears empty.');
  genresCache = detailedGenres;
  genresCacheTime = Date.now();
  return detailedGenres;
}



export async function pickRandomAlbumAndPlay(genres = []) {
  if (!browse || !transport) throw new Error('Not connected to a Roon Core.');
  
  let chosenZoneId = store.get('lastZoneId');
  if (!chosenZoneId || !zonesCache.some(z => z.id === chosenZoneId)) {
    chosenZoneId = zonesCache[0]?.id || null;
    if (chosenZoneId) store.set('lastZoneId', chosenZoneId);
  }
  if (!chosenZoneId) throw new Error('No output zones available.');
  try { transport.change_zone(chosenZoneId); } catch {}
  
  const open = (item_key) => browseAsync({ hierarchy: 'browse', item_key });
  const ciFind = (items, text) => {
    const t = String(text).toLowerCase();
    return (items || []).find(i => (i?.title || '').toLowerCase() === t) || (items || []).find(i => (i?.title || '').toLowerCase().includes(t));
  };

  await browseAsync({ hierarchy: 'browse', pop_all: true });
  const root = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
  let targetKey = null;

  // ... (Genre and library Browse logic remains exactly the same) ...
  if (Array.isArray(genres) && genres.length > 0) {
    const genresNode = ciFind(root.items, 'Genres');
    if (!genresNode?.item_key) throw new Error('Could not locate Genres in this core.');
    await open(genresNode.item_key);
    const wanted = genres[Math.floor(Math.random() * genres.length)];
    const wantedLower = wanted.toLowerCase();
    let genreRow = null, offset = 0;
    while (!genreRow) {
      const page = await loadAsync({ hierarchy: 'browse', item_key: genresNode.item_key, offset, count: 200 });
      const items = page.items || [];
      if (!items.length) break;
      genreRow = items.find(i => (i.title || '').trim().toLowerCase() === wantedLower) || items.find(i => (i.title || '').toLowerCase().includes(wantedLower));
      offset += items.length;
    }
    if (!genreRow?.item_key) throw new Error(`Genre '${wanted}' not found.`);
    await open(genreRow.item_key);
    const gPage = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
    const albumsNode = ciFind(gPage.items, 'Albums') || ciFind(gPage.items, 'All Albums') || ciFind(gPage.items, 'Library Albums');
    if (albumsNode?.item_key) {
      await open(albumsNode.item_key);
      targetKey = albumsNode.item_key;
    } else {
      targetKey = genreRow.item_key;
    }
  } else {
    const library = ciFind(root.items, 'Library');
    if (!library?.item_key) throw new Error("No 'Library' at root");
    await open(library.item_key);
    const lib = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
    const albums = ciFind(lib.items, 'Albums');
    if (!albums?.item_key) throw new Error("No 'Albums' under Library");
    await open(albums.item_key);
    targetKey = albums.item_key;
  }
  
  // --- CORRECTED PICKING LOGIC ---
  const header = await browseAsync({ hierarchy: 'browse' });
  const total = header?.list?.count ?? 0;
  if (total === 0) throw new Error('Album list is empty.');
  
  let picked = null;
  // If most of the list has been played, increase attempts.
  const maxAttempts = Math.min(total, 50) + playedThisSession.size; 
  
  for (let i = 0; i < maxAttempts; i++) {
      const idx = Math.floor(Math.random() * total);
      const one = await loadAsync({ hierarchy: 'browse', item_key: targetKey, offset: idx, count: 1 });
      const candidate = one.items?.[0] || null;

      if (candidate) {
          // Use a stable compound key: "Album Title||Artist Name"
          const compoundKey = `${candidate.title}||${candidate.subtitle}`;
          if (!playedThisSession.has(compoundKey)) {
              picked = candidate;
              break; // Found an unplayed album
          }
      }
  }

  if (!picked) {
      // Clear the history automatically and try one last time
      console.log(`[roonService] Could not find unplayed album. Clearing session history and retrying.`);
      playedThisSession.clear();
      const idx = Math.floor(Math.random() * total);
      const one = await loadAsync({ hierarchy: 'browse', item_key: targetKey, offset: idx, count: 1 });
      picked = one.items?.[0] || null;
      if (!picked) throw new Error(`Could not find an album after resetting session.`);
  }

  // Use the compound key for tracking
  const finalCompoundKey = `${picked.title}||${picked.subtitle}`;
  playedThisSession.add(finalCompoundKey);
  
  // ... (The rest of the function for playing the album remains the same) ...
  await open(picked.item_key);
  const albumPage = await loadAsync({ hierarchy: 'browse', offset: 0, count: 200 });
  let artKey = picked?.image_key || albumPage?.list?.image_key || null;
  if (!artKey) {
    const maybe = (albumPage?.items || []).find(i => i && i.image_key);
    if (maybe) artKey = maybe.image_key;
  }
  if (artKey && !picked.image_key) picked.image_key = artKey;
  const playAlbum = (albumPage.items || []).find(i => i.title === 'Play Album' && i.hint === 'action_list');
  if (playAlbum?.item_key) {
    await browseAsync({ hierarchy: 'browse', item_key: playAlbum.item_key, zone_or_output_id: chosenZoneId });
    const actions = await loadAsync({ hierarchy: 'browse', offset: 0, count: 20 });
    const actionItem = (actions.items || []).find(i => /play\s*now/i.test(i.title || '')) || (actions.items || [])[0];
    if (!actionItem?.item_key) throw new Error('No playable action');
    await browseAsync({ hierarchy: 'browse', item_key: actionItem.item_key, zone_or_output_id: chosenZoneId });
  } else {
    await new Promise((res, rej) => transport.play_from_here({ zone_or_output_id: chosenZoneId }, e => e ? rej(e) : res()));
  }

  return { album: picked.title, artist: picked.subtitle, image_key: artKey };
}


export function getImageDataUrl(image_key, opts = {}) {
  return new Promise((resolve) => {
    if (!core || !image_key) return resolve(null);
    const img = core.services.RoonApiImage;
    if (!img) return resolve(null);
    img.get_image(image_key, { scale: opts.scale || 'fit', width: opts.width || 256, height: opts.height || 256, format: opts.format || 'image/jpeg' }, (err, contentType, body) => {
      if (err || !body) return resolve(null);
      const b64 = Buffer.from(body).toString('base64');
      resolve(`data:${contentType};base64,${b64}`);
    });
  });
}

function maybeEmitNowPlaying(zoneId, meta) {
  if (!zoneId || !meta) return;
  const key = [meta.song, meta.artist, meta.album].join('||');
  if (lastNPByZone[zoneId] === key) return;
  lastNPByZone[zoneId] = key;
  emitEvent({ type: 'nowPlaying', meta });
}

export function getZoneNowPlaying(zoneId) {
  const z = (zonesRaw || []).find(zz => zz.zone_id === zoneId);
  if (!z || !z.now_playing) return null;
  const np = z.now_playing;
  const song = np?.three_line?.line1 || null;
  const artist = np?.three_line?.line2 || null;
  const album = np?.three_line?.line3 || null;
  
  return { song, artist, album, image_key: np?.image_key || null };
}

export async function playAlbumByName(albumName, artistName) {
  if (!browse || !transport) throw new Error('Not connected to a Roon Core.');

  let chosenZoneId = store.get('lastZoneId');
  if (!chosenZoneId) throw new Error('No output zones available.');
  try { transport.change_zone(chosenZoneId); } catch {}

  const open = (item_key) => browseAsync({ hierarchy: 'browse', item_key });
  const ciFind = (items, text) => {
    const t = String(text).toLowerCase();
    return (items || []).find(i => (i?.title || '').toLowerCase() === t) || (items || []).find(i => (i?.title || '').toLowerCase().includes(t));
  };
  
  // 1. Navigate to the main Albums list
  await browseAsync({ hierarchy: 'browse', pop_all: true });
  const root = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
  const library = ciFind(root.items, 'Library');
  if (!library?.item_key) throw new Error("Could not find 'Library' in Roon's root.");
  await open(library.item_key);
  const lib = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
  const albums = ciFind(lib.items, 'Albums');
  if (!albums?.item_key) throw new Error("Could not find 'Albums' in the Library.");
  await open(albums.item_key);
  const albums_item_key = albums.item_key;

  // 2. Search for the album in the list by paging through
  let albumRow = null;
  let offset = 0;
  const albumNameLower = albumName.toLowerCase();
  const artistNameLower = artistName.toLowerCase();

  while (!albumRow) {
    const page = await loadAsync({ hierarchy: 'browse', item_key: albums_item_key, offset, count: 200 });
    const items = page.items || [];
    if (!items.length) break; // Stop if we've reached the end
    albumRow = items.find(i => (i.title || '').toLowerCase() === albumNameLower && (i.subtitle || '').toLowerCase() === artistNameLower);
    offset += items.length;
  }
  
  if (!albumRow?.item_key) throw new Error(`Album '${albumName}' by '${artistName}' not found in the library.`);

  // 3. Play the found album using its fresh item_key
  await browseAsync({ hierarchy: 'browse', item_key: albumRow.item_key });
  const albumPage = await loadAsync({ hierarchy: 'browse', offset: 0, count: 200 });
  const playAlbumAction = (albumPage.items || []).find(i => i.title === 'Play Album' && i.hint === 'action_list');

  if (playAlbumAction?.item_key) {
    await browseAsync({ hierarchy: 'browse', item_key: playAlbumAction.item_key, zone_or_output_id: chosenZoneId });
    const actions = await loadAsync({ hierarchy: 'browse', offset: 0, count: 20 });
    const playNowAction = (actions.items || []).find(i => /play\s*now/i.test(i.title || '')) || (actions.items || [])[0];
    if (!playNowAction?.item_key) throw new Error('No playable action found for this item.');
    await browseAsync({ hierarchy: 'browse', item_key: playNowAction.item_key, zone_or_output_id: chosenZoneId });
  } else {
    // Fallback if a specific "Play Album" action isn't available
    await new Promise((res, rej) => transport.play_from_here({ zone_or_output_id: chosenZoneId }, e => e ? rej(e) : res()));
  }

  return { success: true };
}




export async function playRandomAlbumByArtist(artistName, currentAlbumName) {
  if (isDeepDiveInProgress) {
    console.log(`[DEEP DIVE] IGNORED: A deep dive is already in progress.`);
    return { ignored: true };
  }
  isDeepDiveInProgress = true;
  
  const log = (msg, data) => console.log(`[${new Date().toLocaleTimeString()}] [DEEP DIVE] ${msg}`, data || '');
  
  try {
    if (!browse || !transport) throw new Error('Not connected to a Roon Core.');

    let chosenZoneId = store.get('lastZoneId');
    if (!chosenZoneId) throw new Error('No output zones available.');
    try { transport.change_zone(chosenZoneId); } catch {}

    const open = (item_key) => browseAsync({ hierarchy: 'browse', item_key });
    const ciFind = (items, text) => {
      const t = String(text).toLowerCase();
      return (items || []).find(i => (i?.title || '').toLowerCase() === t) || (items || []).find(i => (i?.title || '').toLowerCase().includes(t));
    };

    log(`--- START for ${artistName} (currently playing: ${currentAlbumName}) ---`);
    
    await browseAsync({ hierarchy: 'browse', pop_all: true });
    const root = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
    const library = ciFind(root.items, 'Library');
    await open(library.item_key);
    const lib = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
    const artists = ciFind(lib.items, 'Artists');
    await open(artists.item_key);
    const artists_item_key = artists.item_key;
    let artistRow = null;
    let offset = 0;
    while (!artistRow) {
      const page = await loadAsync({ hierarchy: 'browse', item_key: artists_item_key, offset, count: 200 });
      if (!page.items || page.items.length === 0) break;
      artistRow = page.items.find(i => (i.title || '').toLowerCase() === artistName.toLowerCase());
      offset += page.items.length;
    }
    if (!artistRow?.item_key) throw new Error(`Artist '${artistName}' not found.`);
    
    await open(artistRow.item_key);
    const artistPage = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });
    const allAlbumsOnPage = (artistPage.items || []).filter(i => i.hint === 'list' && i.subtitle === artistName);
    const availableAlbums = allAlbumsOnPage.filter(a => a.title !== currentAlbumName);
    if (availableAlbums.length === 0) {
      throw new Error(`Not enough albums to pick a new one for '${artistName}'.`);
    }
    const picked = availableAlbums[Math.floor(Math.random() * availableAlbums.length)];
    if (!picked?.item_key) throw new Error('Could not select a new album to play.');
    log(`Randomly selected album: "${picked.title}"`);

    await browseAsync({ hierarchy: 'browse', item_key: picked.item_key });
    const albumPage = await loadAsync({ hierarchy: 'browse', offset: 0, count: 200 });
    let artKey = picked?.image_key || albumPage?.list?.image_key || null;

    const playAlbumAction = (albumPage.items || []).find(i => i.title === 'Play Album' && i.hint === 'action_list');
    if (playAlbumAction?.item_key) {
      await browseAsync({ hierarchy: 'browse', item_key: playAlbumAction.item_key, zone_or_output_id: chosenZoneId });
      const actions = await loadAsync({ hierarchy: 'browse', offset: 0, count: 20 });
      const playNowAction = (actions.items || []).find(i => /play\s*now/i.test(i.title || '')) || (actions.items || [])[0];
      if (!playNowAction?.item_key) throw new Error('No playable action found for this item.');
      await browseAsync({ hierarchy: 'browse', item_key: playNowAction.item_key, zone_or_output_id: chosenZoneId });
    } else {
      await new Promise((res, rej) => transport.play_from_here({ zone_or_output_id: chosenZoneId }, e => e ? rej(e) : res()));
    }
    
    log(`--- SUCCESS for "${picked.title}" ---`);
    return { album: picked.title, artist: picked.subtitle, image_key: artKey };

  } finally {
    isDeepDiveInProgress = false;
  }
}

export function clearSessionHistory() {
  playedThisSession.clear();
  console.log('[roonService] Session play history cleared.');
  return true;
}


// The one function that starts it all
export function initialize(win, st) {
  mainWindow = win;
  store = st;
  connectToRoon();
}