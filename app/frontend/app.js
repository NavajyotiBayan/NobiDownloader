const $=s=>document.querySelector(s);
let current=null, selectedQuality="best", selectedKind="video", selectedFolder="";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const THEME_KEY="nobi-theme";
const THEMES=["midnight","slate","forest","lavender","warm"];

function applyTheme(theme){
  if(THEMES.indexOf(theme)===-1) theme="midnight";
  THEMES.forEach(function(t){
    document.body.classList.remove("theme-"+t);
  });
  document.body.classList.add("theme-"+theme);
  localStorage.setItem(THEME_KEY,theme);

  const menu=document.querySelector("#themeMenu");
  if(menu){
    menu.querySelectorAll("[data-theme]").forEach(function(btn){
      btn.classList.toggle("selected-theme",btn.dataset.theme===theme);
    });
  }
}

function initThemes(){
  const button=document.querySelector("#themeToggle");
  const menu=document.querySelector("#themeMenu");
  applyTheme(localStorage.getItem(THEME_KEY)||"midnight");

  if(!button || !menu) return;

  button.addEventListener("click",function(e){
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle("hidden");
    if(typeof clickSound==="function") clickSound("soft");
  });

  menu.querySelectorAll("[data-theme]").forEach(function(btn){
    btn.addEventListener("click",function(e){
      e.preventDefault();
      e.stopPropagation();
      applyTheme(btn.dataset.theme);
      menu.classList.add("hidden");
      if(typeof clickSound==="function") clickSound("soft");
    });
  });

  document.addEventListener("click",function(e){
    if(!e.target.closest(".theme-picker-wrap")){
      menu.classList.add("hidden");
    }
  });
}

const bytes=n=>{if(!n)return"";let u=["B","KB","MB","GB"],i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+" "+u[i]};
const dur=s=>{if(!s)return"";s=Math.round(s);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
const msg=(t,e=false)=>{$("#message").textContent=t;$("#message").style.color=e?"#ff7880":"#899bb0"};

let audioCtx=null;
function clickSound(type="soft"){
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type="sine";
    o.frequency.value=type==="success"?620:type==="error"?190:420;
    g.gain.setValueAtTime(.0001,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(type==="success"?.035:.018,audioCtx.currentTime+.008);
    g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.075);
    o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+.08);
  }catch(_){}
}
document.addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(b && !b.disabled) clickSound(b.id==="download"||b.id==="analyze"?"soft":"soft");
});
document.querySelectorAll(".format-tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".format-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");selectedKind=b.dataset.kind;renderFormats()});
$("#clearUrl").onclick=()=>$("#url").value="";

async function chooseFolder(){
  try{
    const r=await fetch("/api/select-folder",{method:"POST"});
    const d=await r.json();
    if(!r.ok) throw Error(d.detail||"Folder picker failed.");
    if(d.path){
      selectedFolder=d.path;
      $("#savePath").value=d.path;
      $("#pathStatus").textContent="Selected folder";
      $("#storagePath").textContent=d.path;
      $("#modalPath").textContent=d.path;
      clickSound("success");
      msg("Download folder selected.");
    }
  }catch(e){msg(e.message||"Folder picker could not be opened.",true);clickSound("error")}
}
$("#chooseFolder").onclick=chooseFolder;
$("#savePath").addEventListener("change",()=>{selectedFolder=$("#savePath").value.trim();$("#pathStatus").textContent=selectedFolder?"Custom folder":"Default download folder";$("#storagePath").textContent=selectedFolder||"Local Downloads"});

async function analyze(){
  const url=$("#url").value.trim();if(!url){msg("Paste a URL first.",true);return}
  $("#analyze").disabled=true;msg("Analyzing media…");
  try{
    const r=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
    const d=await r.json();if(!r.ok)throw Error(d.detail||"Analysis failed.");
    current={url,...d};$("#thumb").src=d.thumbnail||"";$("#title").textContent=d.title||"Untitled media";$("#source").textContent=(d.extractor||"MEDIA").toUpperCase();
    const playlistMeta=d.is_playlist ? [`Playlist • ${d.playlist_count} videos`].filter(Boolean) : [d.uploader,dur(d.duration)].filter(Boolean);
    $("#meta").textContent=playlistMeta.join("  •  ");
    $("#mediaTypeTag").textContent=d.is_playlist?"Playlist":"Video";
    $("#qualityTag").textContent=d.is_playlist ? `${d.playlist_count} videos` : ((d.formats?.length||"Detected")+" formats");
    const pi=$("#playlistInfo");
    if(d.is_playlist){ pi.classList.remove("hidden"); pi.innerHTML=`<b>Playlist detected</b><span>${esc(d.playlist_title||d.title)} · ${d.playlist_count} available videos</span><small>Downloads will be saved in <strong>downloads\\${esc(d.playlist_title||d.title)}</strong>.</small>`; } else { pi.classList.add("hidden"); pi.innerHTML=""; }
    $("#mediaCard").classList.remove("hidden");renderFormats();msg(d.is_playlist?`Playlist detected: ${d.playlist_count} videos available. Select a format and download.`:"Media detected. Select a format and download.");
  }catch(e){$("#mediaCard").classList.add("hidden");msg(e.message,true)}finally{$("#analyze").disabled=false}
}
$("#analyze").onclick=analyze;

function renderFormats(){
  const box=$("#formats");if(!current){box.innerHTML="";return}
  if(selectedKind==="audio"){
    const rates=[...new Set((current.formats||[]).map(f=>f.abr).filter(Boolean).map(x=>Math.round(x/8)*8).filter(x=>x>0))].sort((a,b)=>b-a);
    const fallback=[320,256,192,160,128,96,64].filter(x=>!rates.length||rates.includes(x));
    const list=rates.length?rates:fallback;
    box.innerHTML=list.map((x,i)=>`<button class="format ${i===0?"selected":""}" data-value="${x}" data-q="audio"><b>${x}</b><small>kbps</small><i>MP3</i></button>`).join("");
    selectedQuality=list[0]||"best";
  }else{
    // Keep the video selector clean and predictable. The backend/ytdlp
    // resolves the requested target to the best available stream at or
    // below that quality, with "best" as the first option.
    const presets=[
      {q:"best",label:"Best Available",sub:"Auto",rank:99999},
      {q:"360p",label:"360p",sub:"SD",rank:360},
      {q:"480p",label:"480p",sub:"SD",rank:480},
      {q:"720p",label:"720p",sub:"HD",rank:720},
      {q:"1080p",label:"1080p",sub:"FHD",rank:1080},
      {q:"2k",label:"2K",sub:"1440p",rank:1440},
      {q:"4k",label:"4K",sub:"2160p",rank:2160}
    ];
    box.innerHTML=presets.map((x,i)=>`<button class="format ${i===0?"selected":""}" data-value="${x.q}" data-q="${x.q}"><b>${x.label}</b><small>${x.sub}</small><i>Video</i></button>`).join("");
    selectedQuality="best";
  }
  box.querySelectorAll(".format").forEach(b=>b.onclick=()=>{box.querySelectorAll(".format").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");selectedQuality=b.dataset.q});
}

async function startDownload(){
  if(!current)return;
  const mode=selectedKind==="audio"?"audio":"video";
  $("#download").disabled=true;
  openModal("DOWNLOADING","Preparing your download",current.title||"Media",selectedFolder||"Default download folder");
  try{
    const r=await fetch("/api/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:current.url,mode,quality:selectedQuality,save_path:selectedFolder||undefined,is_playlist:!!current.is_playlist,playlist_title:current.playlist_title||current.title})});
    const d=await r.json();if(!r.ok)throw Error(d.detail||"Could not start download.");
    watch(d.job_id);
  }catch(e){closeModal();msg(e.message,true);$("#download").disabled=false}
}
$("#download").onclick=startDownload;

function openModal(state,title,file,path){$("#modalState").textContent=state;$("#modalTitle").textContent=title;$("#modalFile").textContent=file||"";$("#modalPath").textContent=path||"Default download folder";$("#modalPercent").textContent="0";$("#modalProgress").style.width="0%";$("#modalSpeed").textContent="—";$("#modalEta").textContent="ETA —";$("#completeActions").classList.add("hidden");$("#downloadModal").classList.remove("hidden")}
function closeModal(){$("#downloadModal").classList.add("hidden")}
function completeModal(file,path){$("#modalState").textContent="DOWNLOAD COMPLETE";$("#modalTitle").textContent="Your file is ready";$("#modalFile").textContent=file||"";$("#modalPercent").textContent="100";$("#modalProgress").style.width="100%";$("#modalSpeed").textContent="Complete ✓";$("#modalEta").textContent="Finished";$("#completeActions").classList.remove("hidden");$("#downloadModal .loader-ring").style.animation="none";$("#downloadModal .loader-ring span").style.background="#51e0c8";$("#downloadModal .loader-ring").style.borderColor="#51e0c8";$("#modalPath").textContent=path||"Default download folder";$("#openComplete").dataset.path=path||""}
$("#closeComplete").onclick=()=>{closeModal();loadDownloads()};
$("#openComplete").onclick=()=>openFolder($("#openComplete").dataset.path);
async function watch(id){
  let timer=setInterval(async()=>{
    try{
      const d=await (await fetch("/api/jobs/"+id)).json();
      const p=Math.max(0,Math.min(100,Number(d.progress)||0));
      $("#modalPercent").textContent=Math.round(p);$("#modalProgress").style.width=p+"%";
      $("#modalSpeed").textContent=d.speed||"—";$("#modalEta").textContent=d.eta?("ETA "+d.eta):"ETA —";
      if(d.status==="complete"){clearInterval(timer);$("#download").disabled=false;completeModal(d.filename||d.name||"Downloaded file",d.path||selectedFolder||"Default download folder");loadDownloads()}
      if(d.status==="error"){clearInterval(timer);$("#download").disabled=false;closeModal();msg(d.error||"Download failed.",true)}
    }catch(e){}
  },700)
}

async function loadDownloads(){
  try{
    const items=await (await fetch("/api/downloads")).json();
    $("#queueCount").textContent=`(${items.length})`;
    if(!items.length){
      $("#queue").innerHTML=`<div class="empty"><div>⇩</div><b>Your download queue is empty</b><small>Analyze a media URL to start downloading.</small></div>`;
    }else{
      $("#queue").innerHTML=items.map(x=>{
        const folder=x.folder?` · ${esc(x.folder)}`:"";
        return `<div class="qrow"><div class="qthumb"></div><div class="qname"><b>${esc(x.name)}</b><small>Downloaded${folder}</small></div><div class="qprogress"><div><i style="width:100%"></i></div><small>${bytes(x.size)} · Complete</small></div><button class="qbtn">✓</button><button class="qbtn red">×</button></div>`;
      }).join("");
    }
    const recent=items.slice(0,5);
    $("#recentList").innerHTML=recent.length?recent.map(x=>`<div class="recent-row"><div class="recent-img"></div><div><b>${esc(x.name)}</b><small>${bytes(x.size)} · Local</small></div><span>✓</span></div>`).join(""):`<div class="recent-empty">No downloads yet.</div>`;
  }catch(e){}
}

async function loadStorage(){
  try{
    const d=await (await fetch("/api/storage")).json();
    $("#storagePath").textContent=d.path;
    $("#storageUsed").textContent=d.file_count===1?"1 downloaded file":`${d.file_count} downloaded files`;
    $("#storagePercent").textContent=`${d.disk_percent}% used`;
    const meter=$("#storageMeterFill")||$(".storage-meter i");
    if(meter) meter.style.width=Math.max(1,Math.min(100,d.disk_percent))+"%";
    if(!selectedFolder) $("#modalPath").textContent=d.path;
  }catch(e){
    $("#storagePath").textContent="Unavailable";
    $("#storageUsed").textContent="Storage info unavailable";
  }
}

async function openFolder(path=""){
  try{
    const r=await fetch("/api/open-folder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:path||selectedFolder||""})});
    const d=await r.json();
    if(!r.ok) throw Error(d.detail||"Could not open the download folder.");
    clickSound("success");
  }catch(e){msg(e.message,true);clickSound("error")}
}

$("#openFolder").onclick=()=>openFolder();
$("#viewAll").onclick=()=>initAppearance();
initThemes();
loadDownloads();
$("#pauseAll").onclick=()=>msg("Pause controls will be enabled for active jobs.");
$("#clearAll").onclick=()=>{$("#queue").innerHTML=`<div class="empty"><div>⇩</div><b>Your download queue is empty</b><small>Analyze a media URL to start downloading.</small></div>`;$("#queueCount").textContent="(0)"};

loadDownloads();
loadStorage();
