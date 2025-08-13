/* renderer/index.js — Final version with all features */
;(function () {
  if (!window || !window.React || !window.ReactDOM) { throw new Error('React/ReactDOM not found.'); }
  var e = React.createElement; var root = document.getElementById('root');

  function DiceIcon(props){
    return e('svg', Object.assign({ width:16, height:16, viewBox:'0 0 24 24', fill:'none' }, props),
      e('rect', { x:3, y:3, width:18, height:18, rx:4, stroke:'currentColor', 'stroke-width':1.6 }),
      e('circle', { cx:8, cy:8, r:1.4, fill:'currentColor' }),
      e('circle', { cx:16, cy:16, r:1.4, fill:'currentColor' }),
      e('circle', { cx:16, cy:8, r:1.4, fill:'currentColor' }),
      e('circle', { cx:8, cy:16, r:1.4, fill:'currentColor' }),    
      e('circle', { cx:12, cy:12, r:1.4, fill:'currentColor' })
    );
  }

  function relTime(ts){ var d=Date.now()-ts, m=Math.round(d/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; var h=Math.round(m/60); return h+'h ago'; }

// In renderer/index.js

  function useRoon(){
    var _state=React.useState({paired:false,coreName:null,lastZoneId:null,filters:{genres:[]}}); var state=_state[0],setState=_state[1];
    var _zones=React.useState([]); var zones=_zones[0],setZones=_zones[1];
    var _genres=React.useState([]); var genres=_genres[0],setGenres=_genres[1];
    var _busy=React.useState(false); var busy=_busy[0],setBusy=_busy[1];
    
    async function refreshState(){ try { var s = await window.roon.getState(); setState(s); } catch (err) { console.error('Failed to get state:', err); } }
    async function refreshZones(){ try { var z = await window.roon.listZones(); setZones(Array.isArray(z) ? z : []); } catch (err) { console.error('Failed to list zones:', err); } }
    async function refreshGenres(){ try { var g = await window.roon.listGenres(); setGenres(Array.isArray(g) ? g : []); } catch (err) { console.error('Failed to list genres:', err); } }
    async function setFilters(next){ try { await window.roon.setFilters(next || {}); await refreshState(); } catch (err) { console.error('Failed to set filters:', err); } }
    async function selectZone(zoneId){ try { await window.roon.selectZone(zoneId); await refreshState(); } catch (err) { console.error('Failed to select zone:', err); } }
    
    async function playRandom(genres){
      setBusy(true);
      try {
        const result = await window.roon.playRandomAlbum(genres);
        return result;
      } catch (e){
        console.error('Failed to play random album:', e);
        alert(`Error: ${e.message}`); // Show error to the user
        return null;
      } finally {
        setBusy(false);
      }
    }

    async function transportControl(action) { try { await window.roon.transportControl(action); } catch (err) { console.error('Transport failed:', err); } }
    async function changeVolume(value) { try { await window.roon.changeVolume(value); } catch (err) { console.error('Volume change failed:', err); } }

    // --- THESE ARE THE MISSING FUNCTION DEFINITIONS ---
    async function playAlbumByName(album, artist) {
      setBusy(true);
      try { await window.roon.playAlbumByName(album, artist); }
      catch(err) { console.error('Failed to play album by name:', err); alert(`Error: ${err.message}`); }
      finally { setBusy(false); }
    }
    async function playRandomAlbumByArtist(artist, currentAlbum) {
        setBusy(true);
        try { await window.roon.playRandomAlbumByArtist(artist, currentAlbum);
        return await window.roon.playRandomAlbumByArtist(artist, currentAlbum); }
        catch(err) { console.error('Failed to play by artist:', err); alert(`Error: ${err.message}`); }
        finally { setBusy(false); }
    }
    // We removed the UI for this, but it's good practice to keep the function definition here
    async function clearSessionHistory() {
        try { await window.roon.clearSessionHistory(); }
        catch(err) { console.error('Failed to clear session history:', err); }
    }
    // --- END OF MISSING DEFINITIONS ---
    
	React.useEffect(function(){
	  (async function(){ await refreshState(); await refreshZones(); await refreshGenres(); })();
  
	  window.roon.onEvent(function(payload){
	    if (!payload) return;
	    if (payload.type === 'core') {
	      setState(prevState => ({ ...prevState, paired: payload.status === 'paired', coreName: payload.coreDisplayName }));
	    } else if (payload.type === 'zones') {
	      setZones(payload.zones || []);
	    }
	  });
	},[]);
    
    // The return statement is now correct because the functions are defined above
    return { state,zones,genres,busy,refreshGenres,setFilters,selectZone,playRandom,transportControl,changeVolume, playAlbumByName, playRandomAlbumByArtist, clearSessionHistory };
  }


  // renderer/index.js

  function Genres(props){
      var all = props.all, selected = props.selected, setSelected = props.setSelected;
      var _reloading = React.useState(false); var reloading = _reloading[0], setReloading = _reloading[1];

      function toggle(genreTitle){ // Now accepts the genre title string
        if (reloading) return;
        setSelected(p => {
          var s = new Set(p);
          if (s.has(genreTitle)) s.delete(genreTitle);
          else s.add(genreTitle);
          return Array.from(s);
        });
      }

      async function clearAll(){ setSelected([]); }
      async function reload(){ setReloading(true); try{ await props.roon.refreshGenres(); } finally{ setReloading(false);} }

      return e('div',{className:'card activity-card'},
        e('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexShrink: 0 } },
          e('h2', { style: { marginBottom: 10 } }, 'Filter by Genre'),
          e('button', { className: 'btn-link', onClick: reload, disabled: reloading }, reloading ? 'Reloading…' : 'Reload Genres')
        ),

        e('div', { className: 'genre-card-content' },
          e('div', { className: 'toggle-list' },
            all.map(function(genre) { // 'genre' is now an object { title, albumCount }
              var active = selected.includes(genre.title);
              return e('div', {
                key: genre.title, // Use the title as the key
                className: 'toggle-item',
                onClick: () => toggle(genre.title), // Pass the title string to toggle
                'data-active': active,
                'data-disabled': reloading,
              },
                // Display title and album count
                e('span', null, `${genre.title} (${genre.albumCount})`), 
                e('div', { className: 'toggle-switch' })
              );
            })
          )
        ),

        e('div', { className: 'row', style: { marginTop: 'auto', paddingTop: '16px', flexShrink: 0 } },
          e('button',{className:'btn', onClick:clearAll, disabled:reloading || selected.length === 0}, 'Clear Selections')
        )
      );
    }
	

	function App(){
	    var roon=useRoon();
	    var _np=React.useState({song:null, artist:null, album:null, art:null}); var nowPlaying=_np[0],setNowPlaying=_np[1];
	    var _activity=React.useState([]); var activity=_activity[0],setActivity=_activity[1];
	    var _localVolume=React.useState(null); var localVolume=_localVolume[0],setLocalVolume=_localVolume[1];
	    var lastActKeyRef=React.useRef(null);
	    var _sel=React.useState([]); var selected=_sel[0],setSelected=_sel[1];

	    var currentZone = roon.zones.find(function(z) { return z.id === roon.state.lastZoneId; });

	    React.useEffect(function(){
	      function handler(payload){
	        if (payload.type !== 'nowPlaying') return;
	        if (payload.zoneId && payload.zoneId !== roon.state.lastZoneId) return;
	        var m = payload.meta || {};
	        if (m.image_key) {
	          window.roon.getImage(m.image_key).then(function(dataUrl){
	            if (dataUrl) setNowPlaying({ song: m.song, artist: m.artist, album: m.album, art: dataUrl });
	          });
	        } else {
	          setNowPlaying(function(prev) { return { song: m.song, artist: m.artist, album: m.album, art: prev.art }; });
	        }
	      }
	      window.roon.onEvent(handler);
	    }, [roon.state.lastZoneId]);

	    React.useEffect(function(){
	      if (currentZone && currentZone.volume) { setLocalVolume(currentZone.volume.value); }
	      else { setLocalVolume(null); }
	    }, [currentZone?.volume?.value]);
    
	    var toolbar=e('div',{className:'toolbar'},
	      e('div',{className:'seg'}, e('span',{className:'muted'},'Connected to core:'), 
	        e('strong',{ className: roon.state.paired ? 'status-yes' : 'status-no' }, roon.state.paired ? 'Yes' : 'No'), 
	      e('span',{className:'muted'}, '('+(roon.state.coreName||'Core')+')')),
	      e('div',{className:'divider'}),
	      e('div',{className:'seg'}, e('span',{className:'muted'},'Zone'),
	        e('select',{value:roon.state.lastZoneId||'',onChange:function(ev){roon.selectZone(ev.target.value);} }, roon.zones.map(function(z){return e('option',{key:z.id,value:z.id},z.name);}))
	      ),
	      e('div',{className:'spacer'}),
	      e('button',{
	        className:'btn btn-primary',
	        disabled:roon.busy||!roon.state.paired||!roon.state.lastZoneId,
	        onClick: async function() {
	          const result = await roon.playRandom(selected);
	          if (result && !result.ignored) {
	            const actKey = [result.album || '', result.artist || ''].join('||');
	            const artUrl = result.image_key ? await window.roon.getImage(result.image_key) : null;
	            setActivity(a => [{ title: result.album || '—', subtitle: result.artist || '', art: artUrl, t: Date.now(), key: actKey }].concat(a).slice(0,12));
	          }
	        }
	      },
	        roon.busy?e('span',{className:'spinner'}):e(DiceIcon), roon.busy?' Working…':' Play Random Album')
	    );

	    var isPlaying = currentZone && currentZone.state === 'playing';
	    var hasVolumeControl = currentZone && currentZone.volume && currentZone.volume.type === 'number';

	    var npCard = e('div', { className: 'card' },
	      e('h2', null, 'Now Playing'),
	      e('div', { className: 'np' },
	        nowPlaying.art ? e('img', { className: 'cover', src: nowPlaying.art, alt:'Album art' }) : e('div', {className: 'cover'}),
	        e('div', { className: 'np-details' },
	          e('div', null,
	            e('div', { style: { fontSize: 20, fontWeight: 700, marginBottom: 4 } }, nowPlaying.song || '—'),
	            e('div', { style: { fontWeight: 700, marginBottom: 4 } }, nowPlaying.album || ''),
	            e('div', { className: 'muted', style: { fontSize: 15, marginBottom: 12 } }, nowPlaying.artist || '')
	          ),
	          e('div', { style: { marginTop: 'auto' } }, 
	            e('button', {
	                className: 'btn',
	                disabled: roon.busy || !nowPlaying.artist,
	                onClick: async () => {
	                    if (nowPlaying.artist && nowPlaying.album) {
	                        const result = await roon.playRandomAlbumByArtist(nowPlaying.artist, nowPlaying.album);
	                        if (result && !result.ignored) {
	                            const actKey = [result.album || '', result.artist || ''].join('||');
	                            const artUrl = result.image_key ? await window.roon.getImage(result.image_key) : null;
	                            setActivity(a => [{ title: result.album || '—', subtitle: result.artist || '', art: artUrl, t: Date.now(), key: actKey }].concat(a).slice(0, 12));
	                        }
	                    }
	                },
	                style: { width: '100%', marginBottom: '16px' }
	            }, 'Artist Deep Dive'),

	            e('div', { className: 'controls-row' },
	              e('div', { className: 'transport-controls' },
	                e('button', { className: 'btn-icon', onClick: () => roon.transportControl('previous') }, 
	                  e('img', { src: './images/previous-100.png', alt: 'Previous' })
	                ),
	                e('button', { className: 'btn-icon btn-playpause', onClick: () => roon.transportControl('playpause') }, 
	                  e('img', { src: isPlaying ? './images/pause-100.png' : './images/play-100.png', alt: 'Play/Pause' })
	                ),
	                e('button', { className: 'btn-icon', onClick: () => roon.transportControl('next') }, 
	                  e('img', { src: './images/next-100.png', alt: 'Next' })
	                )
	              ),
	              hasVolumeControl ? e('input', {
	                className: 'volume-slider', type: 'range',
	                min: currentZone.volume.min, max: currentZone.volume.max, step: currentZone.volume.step,
	                value: localVolume !== null ? localVolume : currentZone.volume.value,
	                onInput: (ev) => setLocalVolume(ev.target.value),
	                onChange: (ev) => roon.changeVolume(ev.target.value)
	              }) : null
	            )
	          )
	        )
	      )
	    );

	    var genresCard=e(Genres,{roon:roon, all:roon.genres, selected:selected, setSelected:setSelected});

	    var activityCard = e('div',{className:'card activity-card'}, e('h2',null,'Activity'),
	      e('div',{className:'activity'},
	        activity.length > 0 ? activity.map(function(a,i){
	          return e('button',{
	            key:i,
	            className:'item',
	            onClick: async () => {
	              if (a.title && a.subtitle) {
	                const result = await roon.playAlbumByName(a.title, a.subtitle);
	                if (result && !result.ignored) {
	                  // This album is now playing, but we don't need to re-add it to the activity feed.
	                }
	              }
	            },
	            disabled: !a.title || !a.subtitle,
	            style: { width: '100%', appearance: 'none', textAlign: 'left', cursor: (a.title && a.subtitle) ? 'pointer' : 'default' }
	          },
	            a.art?e('img',{className:'thumb',src:a.art,alt:a.title}):e('div',{className:'thumb'}),
	            e('div',null, e('div',{className:'title'},a.title), e('div',{className:'muted'},a.subtitle||''), e('div',{className:'time'}, relTime(a.t)) )
	          );
	        }):e('div',{className:'muted'},'No actions yet.')
	      )
	    );

	    return e('div',{className:'wrap'}, toolbar, e('div',{className:'grid'}, npCard, genresCard, activityCard));
	}

  ReactDOM.createRoot(root).render(e(App));
})();