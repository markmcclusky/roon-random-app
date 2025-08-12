/* renderer/index.js — Final version with all features */
;(function () {
  if (!window || !window.React || !window.ReactDOM) { throw new Error('React/ReactDOM not found.'); }
  var e = React.createElement; var root = document.getElementById('root');

  function DiceIcon(props){
    return e('svg', Object.assign({ width:16, height:16, viewBox:'0 0 24 24', fill:'none' }, props),
      e('rect', { x:3, y:3, width:18, height:18, rx:4, stroke:'currentColor', 'stroke-width':1.6 }),
      e('circle', { cx:9, cy:9, r:1.4, fill:'currentColor' }),
      e('circle', { cx:15, cy:15, r:1.4, fill:'currentColor' }),
      e('circle', { cx:15, cy:9, r:1.4, fill:'currentColor' }),
      e('circle', { cx:9, cy:15, r:1.4, fill:'currentColor' })
    );
  }

  function relTime(ts){ var d=Date.now()-ts, m=Math.round(d/60000); if(m<1)return'just now'; if(m<60)return m+'m ago'; var h=Math.round(m/60); return h+'h ago'; }

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
        return null;
      } finally {
        setBusy(false);
      }
    }
    async function transportControl(action) { try { await window.roon.transportControl(action); } catch (err) { console.error('Transport failed:', err); } }
    async function changeVolume(value) { try { await window.roon.changeVolume(value); } catch (err) { console.error('Volume change failed:', err); } }
    
	React.useEffect(function(){
	  // Initial data fetch remains the same
	  (async function(){ await refreshState(); await refreshZones(); await refreshGenres(); })();
  
	  // New, more efficient event handler
	  window.roon.onEvent(function(payload){
	    if (!payload) return;
    
	    // Update state directly from the payload's data
	    if (payload.type === 'core') {
	      setState(prevState => ({ ...prevState, paired: payload.status === 'paired', coreName: payload.coreDisplayName }));
	    } else if (payload.type === 'zones') {
	      setZones(payload.zones || []);
	    }
	    // The nowPlaying event is handled by a different useEffect, so we don't need to touch it here.
	  });
	},[]);
    
    return { state,zones,genres,busy,refreshGenres,setFilters,selectZone,playRandom,transportControl,changeVolume };
  }

  function Genres(props){
    var all=props.all, selected=props.selected, setSelected=props.setSelected;
    var _reloading=React.useState(false); var reloading=_reloading[0],setReloading=_reloading[1];
    
    function toggle(g){ setSelected(p => { var s=new Set(p); if(s.has(g))s.delete(g); else s.add(g); return Array.from(s); }); }
    async function clearAll(){ setSelected([]); }
    async function reload(){ setReloading(true); try{ await props.roon.refreshGenres(); } finally{ setReloading(false);} }
    
    return e('div',{className:'card'},
      e('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' } },
        e('h2', { style: { marginBottom: 10 } }, 'Filter by Genre'),
        e('button', { className: 'btn-link', onClick: reload, disabled: reloading }, reloading ? 'Reloading…' : 'Reload Genres')
      ),
      
      e('div',{className:'chipgrid'}, all.map(function(g){ var active=selected.includes(g); var cls='chip'+(active?' chip-active':''); return e('button',{key:g,className:cls,onClick:()=>toggle(g),disabled:reloading},g);})),
      
      e('div', { className: 'row', style: { marginTop: 12 } },
        e('button',{className:'btn', onClick:clearAll, disabled:reloading}, 'Clear Genre Selections')
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
        var m = payload.meta || {};
        setNowPlaying(function(prevNowPlaying) { return { song: m.song, artist: m.artist, album: m.album, art: prevNowPlaying.art }; });
        if (m.image_key) {
          window.roon.getImage(m.image_key).then(function(dataUrl){
            if (dataUrl) setNowPlaying(function(prevNowPlaying) { return {...prevNowPlaying, art: dataUrl} });
          });
        }
      }
      window.roon.onEvent(handler);
    }, []);

    React.useEffect(function() {
      if (!roon.state.lastZoneId) return;
      (async function() {
        try {
          const meta = await window.roon.getZoneNowPlaying(roon.state.lastZoneId);
          if (!meta) { setNowPlaying({song:null, artist:null, album:null, art:null}); return; }
          setNowPlaying({ song: meta.song, artist: meta.artist, album: meta.album, art: null });
          if (meta.image_key) {
            const dataUrl = await window.roon.getImage(meta.image_key);
            if (dataUrl) setNowPlaying(p => ({...p, art: dataUrl}));
          }
        } catch(e){
          console.error('Failed to get Now Playing for new zone:', e);
        }
      })();
    }, [roon.state.lastZoneId]);
    
    React.useEffect(function(){
      if (currentZone && currentZone.volume) { setLocalVolume(currentZone.volume.value); }
      else { setLocalVolume(null); }
    }, [currentZone?.volume?.value]);

    var toolbar=e('div',{className:'toolbar'},
      e('div',{className:'seg'}, e('span',{className:'muted'},'Connected:'), e('strong',null, roon.state.paired?'Yes':'No'), e('span',{className:'muted'}, '('+(roon.state.coreName||'Core')+')')),
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
          if (result) {
            const actKey = [result.album || '', result.artist || ''].join('||');
            let artUrl = null;
            if (result.image_key) {
              artUrl = await window.roon.getImage(result.image_key);
            }
            setActivity(function(a) {
              lastActKeyRef.current = actKey;
              return [{title: result.album || '—', subtitle: result.artist || '', art: artUrl, t: Date.now(), key: actKey}].concat(a).slice(0,12);
            });
          }
        }
      },
        roon.busy?e('span',{className:'spinner'}):e(DiceIcon), roon.busy?' Working…':' Play Random Album')
    );

    var isPlaying = currentZone && currentZone.state === 'playing';
    var hasVolumeControl = currentZone && currentZone.volume && currentZone.volume.type === 'number';

// In renderer/index.js, inside the App() function...

var npCard = e('div', { className: 'card' },
  e('h2', null, 'Now Playing'),
  e('div', { className: 'np' },
    nowPlaying.art ? e('img', { className: 'cover', src: nowPlaying.art, alt:'Album art' }) : e('div', {className: 'cover'}),
    e('div', { className: 'np-details' },
      e('div', null,
        e('div', { style: { fontSize: 20, fontWeight: 700, marginBottom: 4 } }, nowPlaying.song || '—'),
        e('div', { style: { fontWeight: 700, marginBottom: 4 } }, nowPlaying.album || ''),
        e('div', { className: 'muted', style: { fontSize: 15 } }, nowPlaying.artist || '')
      ),
      e('div', { className: 'controls-row' },
        e('div', { className: 'transport-controls' },
          // MODIFICATION: Replace SVGs with <img> tags
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
);

    var genresCard=e(Genres,{roon:roon, all:roon.genres, selected:selected, setSelected:setSelected});

    var activityCard = e('div',{className:'card activity-card'}, e('h2',null,'Activity'),
      e('div',{className:'activity'},
        activity.length > 0 ? activity.map(function(a,i){
          return e('div',{key:i,className:'item'},
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