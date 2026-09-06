const $=s=>document.querySelector(s);
let current=null,selectedQuality='best',selectedKind='video',selectedFolder='';
let analysisController=null,downloadWatchTimer=null,activeJobId=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const THEMES={forest:['#668f72','#88a994'],midnight:['#79c59a','#9ab7a4'],slate:['#6b8797','#9baab3'],lavender:['#81729b','#a995bd'],warm:['#8a8f70','#b1a987']};
const THEME_KEY='nobi-theme';
function applyTheme(t){if(!THEMES[t])t='forest';Object.keys(THEMES).forEach(x=>document.body.classList.remove('theme-'+x));document.body.classList.add('theme-'+t);localStorage.setItem(THEME_KEY,t);renderThemeSwatches();}
function renderThemeSwatches(){const box=$('#themeSwatches');if(!box)return;const active=localStorage.getItem(THEME_KEY)||'forest';box.innerHTML=Object.entries(THEMES).map(([name,v])=>`<button class="theme-swatch ${name===active?'selected':''}" data-theme="${name}" title="${name}" style="background:linear-gradient(135deg,${v[0]},${v[1]})"></button>`).join('');box.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>applyTheme(b.dataset.theme));}
function initTheme(){applyTheme(localStorage.getItem(THEME_KEY)||'forest');$('#themeButton').onclick=()=>{const names=Object.keys(THEMES),now=localStorage.getItem(THEME_KEY)||'forest';applyTheme(names[(names.indexOf(now)+1)%names.length])}}
let audioCtx=null;function clickSound(type='soft'){try{audioCtx ||= new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=type==='success'?620:type==='error'?190:420;g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(type==='success'?.025:.012,audioCtx.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.06);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.07)}catch(_){}}
document.addEventListener('click',e=>{const el=e.target.closest('button,a,[role=\"button\"]');if(!el||el.disabled||el.dataset.noSound==='true')return;clickSound('soft')});
const bytes=n=>{if(!n)return'';let u=['B','KB','MB','GB'],i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+' '+u[i]};
const dur=s=>{if(!s)return'';s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const msg=(t,error=false)=>{const el=$('#message');el.textContent=t;el.className='message '+(error?'error':'')};
function nav(view){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));$('#sidebar').classList.remove('open');if(view==='downloads')loadDownloads();if(view==='playlists')loadPlaylists()}
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>nav(b.dataset.view));$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');
$('#clearUrl').onclick=()=>{$('#url').value='';$('#url').focus()};

document.querySelectorAll('.source-chip').forEach(b=>b.onclick=()=>{
  const site=b.dataset.site, home=b.dataset.url;
  $('#url').focus();
  $('#url').placeholder=`Paste a ${site} video or playlist URL…`;
  msg(`${site} selected. Copy a video, post, reel or playlist URL and paste it above.`);
  // A second click opens the source, keeping the first click focused on the paste workflow.
  if(b.dataset.armed==='1'){window.open(home,'_blank','noopener');b.dataset.armed='0'}else{b.dataset.armed='1';setTimeout(()=>b.dataset.armed='0',2200)}
});

async function chooseFolder(){try{const r=await fetch('/api/select-folder',{method:'POST'}),d=await r.json();if(!r.ok)throw Error(d.detail||'Folder picker failed.');if(d.path){selectedFolder=d.path;updateFolder(d.path);msg('Download folder selected.');clickSound('success')}}catch(e){msg(e.message||'Folder picker could not be opened.',true);clickSound('error')}}
function updateFolder(path){$('#savePathLabel').textContent=path||'NobiDownloader\\downloads';$('#pathStatus').textContent=path?'Custom folder':'Default download folder';$('#modalPath').textContent=path||'NobiDownloader\\downloads';}
$('#chooseFolder').onclick=chooseFolder;$('#savePath').onchange=()=>{selectedFolder=$('#savePath').value.trim();updateFolder(selectedFolder)};
const VIDEO_PRESETS=[['best','Best Available','Highest available'],['360p','360p','SD'],['480p','480p','SD'],['720p','720p','HD'],['1080p','1080p','FHD'],['2k','2K','1440p'],['4k','4K','2160p']];
const AUDIO_PRESETS=[['128','128 kbps','MP3'],['192','192 kbps','MP3'],['256','256 kbps','MP3'],['320','320 kbps','MP3']];
function sourceLimits(){
  const formats=current?.formats||[];
  const heights=formats.map(f=>Number(f.height)||0).filter(Boolean);
  const abr=formats.map(f=>Number(f.abr)||0).filter(Boolean);
  return {maxHeight:heights.length?Math.max(...heights):null,maxAbr:abr.length?Math.max(...abr):null};
}
function qualityAvailability(q){
  const lim=sourceLimits();
  if(selectedKind==='audio'){
    if(!lim.maxAbr) return 'Source will be checked when downloading';
    const n=Number(q); return lim.maxAbr>=n?'Available':'Falls back to '+Math.round(lim.maxAbr)+' kbps';
  }
  if(q==='best') return 'No quality limit';
  if(!lim.maxHeight) return 'Source will be checked when downloading';
  const target=q==='2k'?1440:q==='4k'?2160:Number(q.replace('p',''));
  if(lim.maxHeight>=target) return 'Available';
  return 'Uses best available · '+lim.maxHeight+'p';
}
function formatList(){
  const presets=selectedKind==='audio'?AUDIO_PRESETS:VIDEO_PRESETS;
  selectedQuality=selectedKind==='audio'?'320':'best';
  return presets.map((x,i)=>({q:x[0],label:x[1],sub:x[2],tag:qualityAvailability(x[0]),sel:i===0}));
}
function renderFormats(){
  const list=formatList();
  const lim=sourceLimits();
  $('#formats').innerHTML=list.map(x=>`<button class="format ${x.sel?'selected':''}" data-q="${x.q}"><b>${x.label}</b><small>${x.sub}</small><i>${x.tag}</i>${x.sel?'<span class="check">✓</span>':''}</button>`).join('');
  $('#formats').querySelectorAll('.format').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.format').forEach(x=>{x.classList.remove('selected');x.querySelector('.check')?.remove()});
    b.classList.add('selected');b.insertAdjacentHTML('beforeend','<span class="check">✓</span>');selectedQuality=b.dataset.q;
    const label=b.querySelector('b').textContent;
    const availability=b.querySelector('i').textContent;
    $('#downloadSummary').textContent=availability.startsWith('Uses best')||availability.startsWith('Falls back')?`${label} selected · ${availability}`:`Selected: ${label}`;
  });
  const note=$('#qualityAvailabilityNote');
  if(note){
    if(selectedKind==='video' && lim.maxHeight) note.textContent=`Source maximum: ${lim.maxHeight}p · Choose any limit and NobiDownloader will use the best available quality at or below it.`;
    else if(selectedKind==='audio' && lim.maxAbr) note.textContent=`Source maximum: ${Math.round(lim.maxAbr)} kbps · NobiDownloader will use the best available bitrate at or below your selection.`;
    else note.textContent='Quality choices stay simple. NobiDownloader resolves the best matching source when you download.';
  }
}
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');selectedKind=b.dataset.kind;renderFormats()});
let analysisTimer=null;
const analysisStages=[
  ['Reading your link','Checking the source and making sure the URL can be understood.'],
  ['Finding the media','Looking for title, thumbnail, duration and playlist details.'],
  ['Finding your formats','Checking the available video qualities and audio options.'],
  ['Preparing your workspace','Almost ready — arranging the best choices for you.']
];
function startAnalysisAnimation(){
  const modal=$('#analyzeModal'); modal.classList.remove('hidden');
  $('#cancelAnalysis').disabled=false;
  let step=0;
  const paint=()=>{const s=analysisStages[step];$('#analysisTitle').textContent=s[0];$('#analysisText').textContent=s[1];document.querySelectorAll('.analysis-step').forEach((x,i)=>x.classList.toggle('active',i===step));};
  paint();
  clearInterval(analysisTimer);
  analysisTimer=setInterval(()=>{if(step<analysisStages.length-1){step++;paint()}},900);
}
function stopAnalysisAnimation(success=true){
  clearInterval(analysisTimer); analysisTimer=null;
  if(success){document.querySelectorAll('.analysis-step').forEach(x=>x.classList.add('done'));$('#analysisTitle').textContent='All set';$('#analysisText').textContent='Your download workspace is ready.'}
  setTimeout(()=>$('#analyzeModal').classList.add('hidden'),success?380:120);
}
function cancelAnalysis(){
  if(!analysisController)return;
  analysisController.abort();
  analysisController=null;
  stopAnalysisAnimation(false);
  $('#analyze').disabled=false;
  msg('Analysis cancelled.');
  clickSound('soft');
}
$('#cancelAnalysis').onclick=cancelAnalysis;
async function analyze(){const url=$('#url').value.trim();if(!url){msg('Paste a URL first.',true);return}$('#analyze').disabled=true;msg('');analysisController=new AbortController();startAnalysisAnimation();try{const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:analysisController.signal});const d=await r.json();if(!r.ok)throw Error(d.detail||'Analysis failed.');current={url,...d};$('#thumb').src=d.thumbnail||'';$('#title').textContent=d.title||'Untitled media';$('#source').textContent=(d.extractor||'MEDIA').toUpperCase();$('#meta').textContent=(d.is_playlist?[`${d.playlist_count} available videos`]:[d.uploader,dur(d.duration)].filter(Boolean)).join('  •  ');$('#duration').textContent=d.is_playlist?'PLAYLIST':dur(d.duration);$('#mediaTypeTag').textContent=d.is_playlist?'Playlist':'Video';$('#qualityTag').textContent=d.is_playlist?`${d.playlist_count} videos`:`${d.formats?.length||0} formats`;const pb=$('#playlistBadge'),pi=$('#playlistInfo'),ph=$('#playlistHint'),pt=$('#playlistToggle');if(d.is_playlist){pb.classList.remove('hidden');$('#playlistCount').textContent=`${d.playlist_count} videos`;$('#playlistName').textContent=d.playlist_title||d.title;pt.classList.remove('hidden');pi.classList.remove('hidden');pi.innerHTML=`<b>Playlist detected</b><span>${esc(d.playlist_title||d.title)} · ${d.playlist_count} available videos</span><small>Downloads will be saved in a folder named after this playlist.</small>`;ph.classList.remove('hidden');$('#download').textContent='↓  Download Playlist';$('#downloadSummary').textContent=`Ready to download ${d.playlist_count} videos.`}else{pb.classList.add('hidden');pi.classList.add('hidden');ph.classList.add('hidden');pt.classList.add('hidden');$('#download').textContent='↓  Download Now';$('#downloadSummary').textContent='Ready when you are.'}$('#mediaCard').classList.remove('hidden');renderFormats();stopAnalysisAnimation(true);msg(d.is_playlist?`Playlist detected: ${d.playlist_count} videos available.`:'Media detected. Choose a format and download.');clickSound('success')}catch(e){if(e.name==='AbortError')return;stopAnalysisAnimation(false);$('#mediaCard').classList.add('hidden');msg(e.message,true);clickSound('error')}finally{analysisController=null;$('#analyze').disabled=false}}
$('#analyzeForm').onsubmit=e=>{e.preventDefault();analyze()};
async function startDownload(){if(!current)return;const mode=selectedKind==='audio'?'audio':'video';$('#download').disabled=true;openModal('DOWNLOADING','Preparing your download',current.title||'Media',selectedFolder);try{const r=await fetch('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:current.url,mode,quality:selectedQuality,save_path:selectedFolder||undefined,is_playlist:!!current.is_playlist,playlist_title:current.playlist_title||current.title,playlist_count:Number(current.playlist_count||0)})});const d=await r.json();if(!r.ok)throw Error(d.detail||'Could not start download.');activeJobId=d.job_id;watch(d.job_id)}catch(e){closeModal();msg(e.message,true);$('#download').disabled=false;clickSound('error')}}
$('#download').onclick=startDownload;
function openModal(state,title,file,path){$('#cancelDownload').classList.remove('hidden');$('#cancelDownload').disabled=false;$('#modalState').textContent=state;$('#modalTitle').textContent=title;$('#modalFile').textContent=file||'';$('#modalItem').textContent='';$('#modalPath').textContent=path||'NobiDownloader\downloads';$('#modalPercent').textContent='0';$('#modalProgress').style.width='0%';$('#modalSize').textContent='Starting transfer…';$('#completeActions').classList.add('hidden');$('#closeModal').classList.add('hidden');$('#modalCheck').textContent='↓';$('#downloadModal').classList.remove('hidden')}
function closeModal(){$('#downloadModal').classList.add('hidden')}
function completeModal(file,path,sizeText){$('#cancelDownload').classList.add('hidden');$('#modalItem').textContent='Transfer finished successfully';$('#modalState').textContent='DOWNLOAD COMPLETE';$('#modalTitle').textContent='Your file is ready';$('#modalFile').textContent=file||'';$('#modalPercent').textContent='100';$('#modalProgress').style.width='100%';$('#modalSize').textContent=sizeText?'File size '+sizeText:'Finished';$('#completeActions').classList.remove('hidden');$('#closeModal').classList.remove('hidden');$('#modalCheck').textContent='✓';$('#modalPath').textContent=path||'NobiDownloader\downloads';$('#openComplete').dataset.path=path||''}
$('#closeModal').onclick=closeModal;$('#closeComplete').onclick=()=>{closeModal();loadDownloads()};$('#openComplete').onclick=()=>openFolder($('#openComplete').dataset.path);
async function cancelDownload(){
  if(!activeJobId)return;
  if(!confirm('Cancel this download?\n\nThe current download will be stopped.'))return;
  const b=$('#cancelDownload'); if(b)b.disabled=true;
  try{
    const r=await fetch('/api/jobs/'+activeJobId+'/cancel',{method:'POST'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.detail||'Could not cancel the download.');
    if(downloadWatchTimer){clearInterval(downloadWatchTimer);downloadWatchTimer=null;}
    $('#download').disabled=false;
    closeModal();
    msg('Download cancelled.');
    clickSound('soft');
  }catch(e){if(b)b.disabled=false;msg(e.message||'Could not cancel the download.',true);clickSound('error')}
}
$('#cancelDownload').onclick=cancelDownload;
async function watch(id){if(downloadWatchTimer)clearInterval(downloadWatchTimer);downloadWatchTimer=setInterval(async()=>{try{const d=await(await fetch('/api/jobs/'+id)).json();let p=Math.max(0,Math.min(100,Number(d.progress)||0));$('#modalState').textContent='DOWNLOADING';$('#modalTitle').textContent=d.total_items>1?'Downloading your playlist':'Downloading your media';$('#modalPercent').textContent=Math.round(p);$('#modalProgress').style.width=p+'%';if(d.total_items>1){const item=Math.max(0,Number(d.current_item)||0),total=Math.max(0,Number(d.total_items)||0),done=Math.max(0,Number(d.completed_items)||0);$('#modalItem').textContent=item&&total?`Video ${Math.min(item,total)} of ${total} · ${Math.round(Number(d.current_progress)||0)}% current`:`Preparing playlist progress…`;$('#modalSize').textContent=d.downloaded_text?'Downloaded '+d.downloaded_text:'Live transfer progress';}else{$('#modalItem').textContent=d.filename?'Downloading '+d.filename:'Live transfer progress';$('#modalSize').textContent=d.downloaded_text?'Downloaded '+d.downloaded_text:'Live transfer progress';}if(d.status==='complete'){clearInterval(downloadWatchTimer);downloadWatchTimer=null;activeJobId=null;$('#download').disabled=false;completeModal(d.filename||'Downloaded file',d.path||selectedFolder,d.size_text||'');loadDownloads();clickSound('success')}if(d.status==='error'){clearInterval(downloadWatchTimer);downloadWatchTimer=null;activeJobId=null;$('#download').disabled=false;closeModal();msg(d.error||'Download failed.',true);clickSound('error')}}catch(_){}} ,350)}
async function loadDownloads(){try{const items=await(await fetch('/api/downloads')).json();$('#downloadCount').textContent=`${items.length} ${items.length===1?'file':'files'}`;if(!items.length){$('#downloadsList').innerHTML='<div class="empty-state"><strong>No downloads yet</strong><span>Your completed files will appear here.</span></div>'}else{$('#downloadsList').innerHTML=items.map(x=>`<div class="file-row"><div class="file-icon">↓</div><div class="file-name"><b>${esc(x.name)}</b><small>${esc(x.folder||'Downloads')} · ${new Date(x.modified*1000).toLocaleString()}</small></div><span class="file-size">${bytes(x.size)}</span><div class="file-actions"><button class="outline" data-open="${esc(x.path)}">Open</button></div></div>`).join('');$('#downloadsList').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openFolder(b.dataset.open))}}catch(_){}}
function loadPlaylists(){loadDownloads().then(()=>{fetch('/api/downloads').then(r=>r.json()).then(items=>{const groups={};items.filter(x=>x.folder).forEach(x=>(groups[x.folder] ||= []).push(x));const names=Object.keys(groups);$('#playlistsList').innerHTML=names.length?names.map(n=>`<article class="playlist-card"><h3>☷ ${esc(n)}</h3><p>${groups[n].length} downloaded ${groups[n].length===1?'file':'files'} in this playlist folder.</p><button class="outline" data-folder="${esc(groups[n][0].path)}">Open folder →</button></article>`).join(''):'<div class="empty-state"><strong>No playlist downloads yet</strong><span>Analyze a YouTube playlist from Home to get started.</span></div>';$('#playlistsList').querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>openFolder(b.dataset.folder))}).catch(()=>{})})}
async function openFolder(path=''){try{const r=await fetch('/api/open-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:path||selectedFolder||''})});const d=await r.json();if(!r.ok)throw Error(d.detail||'Could not open the folder.');clickSound('success')}catch(e){msg(e.message,true);clickSound('error')}}
$('#refreshDownloads').onclick=loadDownloads;$('#openFolder').onclick=()=>openFolder();
$('#stopServer').onclick=stopServer;
$('#dashboardStopServer').onclick=stopServer;
async function stopServer(){
  if(!confirm('Stop NobiDownloader?\n\nThis will close the local server and stop any active downloads.')) return;
  const b=$('#stopServer'),db=$('#dashboardStopServer'),st=$('#serverStatus');
  if(b)b.disabled=true; if(db)db.disabled=true;
  if(st){st.textContent='● Stopping…';st.classList.add('stopping')}
  try{
    const r=await fetch('/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.detail||'Could not stop the server.');
    if(st)st.textContent='● Server stopping'; if(db)db.textContent='Closing…';
    msg('NobiDownloader is shutting down. You can close this browser tab.');
    clickSound('success');
  }catch(e){
    if(b)b.disabled=false; if(db)db.disabled=false; if(db)db.textContent='Close Server';
    if(st){st.textContent='● Running';st.classList.remove('stopping')}
    msg(e.message||'Could not stop the server.',true);
    clickSound('error');
  }
}

initTheme();
loadDownloads();
