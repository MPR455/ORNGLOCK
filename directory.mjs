import { DIRECTORY_DATA } from './directory-data.mjs';

let closeMenu = () => {};
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var directoryContacts=[],directoryContactById={},directoryJumpRestoreFocus=true;
var directoryHistory={searches:[],calls:[]},directorySearchTimer=null,directorySearchOpenState=null,directoryCallPointerActive=false;
var DIRECTORY_HISTORY_KEY='ornglock_directory_history_v1';
function directoryNormalize(value){return String(value).normalize('NFKC').toLowerCase().replace(/[\s()#,+\-]/g,'');}
function directoryDialNumber(raw,emergency,randomize){
  var number=String(raw).normalize('NFKC').replace(/[\s()\-]/g,'');
  if(emergency&&/^#\d+$/.test(number)){
    var index=randomize?Math.floor(Math.random()*DIRECTORY_DATA.transfers.length):0;
    return DIRECTORY_DATA.transfers[index]+','+number.slice(1);
  }
  return number.replace(/#/g,',');
}
function directoryCallLink(contact,raw,recent){
  var extension=contact.emergency&&/^#\d+$/.test(raw);
  var label=extension?'透過急診轉接撥打 '+contact.name+' 分機 '+raw.slice(1):'撥打 '+contact.name+' '+raw;
  return '<a class="directory-call'+(recent?' directory-recent-call':'')+'" href="tel:'+directoryDialNumber(raw,contact.emergency,false)+'" data-directory-number="'+esc(raw)+'" data-directory-contact="'+contact.id+'" data-emergency="'+(contact.emergency?'1':'0')+'" aria-label="'+esc(label)+'">'
    +(recent?'<strong>'+esc(contact.name)+'</strong>':'')
    +'<span class="directory-call-number"><span class="directory-call-icon" aria-hidden="true">☎</span> '+esc(raw)+'</span>'
    +(recent?'<small>'+esc(contact.sectionName)+'</small>':'')+'</a>';
}
function buildDirectory(){
  directoryContacts=[];directoryContactById={};
  var sections=document.getElementById('directory-sections'),jumpGrid=document.getElementById('directory-jump-grid');
  sections.innerHTML=DIRECTORY_DATA.sections.map(function(section){
    return '<details class="directory-section" id="'+section.id+'" data-directory-tone="'+section.tone+'" aria-labelledby="'+section.id+'-title">'
      +'<summary class="directory-section-summary" id="'+section.id+'-summary"><h2 id="'+section.id+'-title">'+esc(section.name)+'</h2></summary>'
      +'<div class="directory-section-body">'+(section.description?'<p class="directory-description">'+esc(section.description)+'</p>':'')
      +section.groups.map(function(group){
        var tag=group.name?'details':'div';
        return '<'+tag+' class="directory-group'+(group.name?' has-summary':'')+'" id="'+group.id+'" data-directory-tone="'+group.tone+'">'
          +(group.name?'<summary class="directory-group-summary"><h3>'+esc(group.name)+'</h3></summary>':'')
          +'<div class="directory-group-body">'
          +'<div class="directory-contact-grid">'+group.contacts.map(function(contact,index){
            var meta={id:contact.id,name:contact.name,numbers:contact.numbers,emergency:section.dialViaEmergency===true||section.name==='急診',sectionId:section.id,sectionName:section.name};
            directoryContactById[contact.id]=meta;
            var rankHeading=contact.rank&&(!index||contact.rank!==group.contacts[index-1].rank)?'<h4 class="directory-rank-heading" data-directory-rank-heading="'+contact.rank+'">'+esc(contact.rank)+'</h4>':'';
            var heading=contact.rank?'h5':'h4';
            return rankHeading+'<article class="directory-contact" id="'+contact.id+'"'+(contact.rank?' data-directory-rank="'+contact.rank+'"':'')+'><'+heading+'>'+esc(contact.name)+'</'+heading+'>'
              +(contact.numbers.length?'<div class="directory-phone-buttons">'+contact.numbers.map(function(raw){return directoryCallLink(meta,raw,false);}).join('')+'</div>':'<p class="directory-missing">未提供電話</p>')+'</article>';
          }).join('')+'</div>'
          +(group.notes.length?'<div class="directory-notes">'+group.notes.map(function(note){return '<p class="directory-note"><strong>'+esc(note.name)+'</strong>'+(note.text?'：'+esc(note.text):'')+'</p>';}).join('')+'</div>':'')+'</div></'+tag+'>';
      }).join('')+'</div></details>';
  }).join('');
  renderDirectoryJump();
  DIRECTORY_DATA.sections.forEach(function(section){
    section.groups.forEach(function(group,index){
      group.contacts.forEach(function(contact){directoryContacts.push({
        element:document.getElementById(contact.id),
        rank:contact.rank||'',
        search:directoryNormalize([section.name,group.name,contact.rank||'',contact.name].concat(contact.numbers).join(' '))
      });});
      var groupElement=document.getElementById(section.id).querySelectorAll('.directory-group')[index];
      groupElement.querySelectorAll('.directory-note').forEach(function(note){note.dataset.search=directoryNormalize(section.name+' '+group.name+' '+note.textContent);});
    });
  });
  loadDirectoryHistory();renderDirectoryHistory();
  var search=document.getElementById('directory-search');
  search.addEventListener('input',function(event){
    filterDirectory();clearTimeout(directorySearchTimer);
    if(!event.isComposing&&directoryNormalize(search.value))directorySearchTimer=setTimeout(function(){rememberDirectorySearch(search.value);},900);
  });
  search.addEventListener('keydown',function(event){if(event.key==='Enter'&&!event.isComposing){clearTimeout(directorySearchTimer);rememberDirectorySearch(search.value);}});
  search.addEventListener('blur',function(event){
    clearTimeout(directorySearchTimer);
    var target=event.relatedTarget;
    // A history repaint must wait until a dial link has received its click.
    rememberDirectorySearch(search.value,!directoryCallPointerActive&&!(target&&target.closest('#directory-history,a[data-directory-number]')));
  });
  document.getElementById('directory-clear').addEventListener('click',function(){clearTimeout(directorySearchTimer);search.value='';filterDirectory();search.focus();});
  document.getElementById('directory-quick-trigger').addEventListener('click',openDirectoryJump);
  document.querySelector('.directory-jump-close').addEventListener('click',closeDirectoryJump);
  document.getElementById('directory-jump-back').addEventListener('click',function(){
    renderDirectoryJump();document.getElementById('directory-jump-dialog').scrollTop=0;
    document.querySelector('[data-directory-section]').focus();
  });
  var dialog=document.getElementById('directory-jump-dialog');
  dialog.addEventListener('close',function(){
    document.body.classList.remove('directory-jump-open');
    document.getElementById('directory-quick-trigger').setAttribute('aria-expanded','false');
    if(directoryJumpRestoreFocus)document.getElementById('directory-quick-trigger').focus({preventScroll:true});
  });
  dialog.addEventListener('click',function(event){
    if(event.target!==dialog)return;
    var bounds=dialog.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDirectoryJump();
  });
  filterDirectory();
  var resizeDirectory=new ResizeObserver(updateDirectoryOffsets);
  resizeDirectory.observe(document.querySelector('header'));
  resizeDirectory.observe(document.getElementById('directory-toolbar'));
  updateDirectoryOffsets();
}
function loadDirectoryHistory(){
  try{
    var saved=JSON.parse(localStorage.getItem(DIRECTORY_HISTORY_KEY)||'{}');
    if(Array.isArray(saved.searches))directoryHistory.searches=saved.searches.filter(function(query){return typeof query==='string'&&query.length<=100&&directoryNormalize(query);}).slice(0,8);
    if(Array.isArray(saved.calls))directoryHistory.calls=saved.calls.filter(function(call){
      var contact=call&&directoryContactById[call.id];return contact&&contact.numbers.indexOf(call.number)!==-1;
    }).map(function(call){return {id:call.id,number:call.number};}).slice(0,6);
  }catch(error){}
}
function saveDirectoryHistory(){try{localStorage.setItem(DIRECTORY_HISTORY_KEY,JSON.stringify(directoryHistory));}catch(error){}}
function rememberDirectorySearch(value,render){
  var query=String(value).normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,100);
  if(!directoryNormalize(query))return;
  directoryHistory.searches=[query].concat(directoryHistory.searches.filter(function(old){return directoryNormalize(old)!==directoryNormalize(query);})).slice(0,8);
  saveDirectoryHistory();if(render!==false)renderDirectoryHistory();
}
function rememberDirectoryCall(id,number){
  var contact=directoryContactById[id];if(!contact||contact.numbers.indexOf(number)===-1)return;
  directoryHistory.calls=[{id:id,number:number}].concat(directoryHistory.calls.filter(function(old){return old.id!==id||old.number!==number;})).slice(0,6);
  saveDirectoryHistory();
  // Keep the activated anchor in place until its native tel: action has run.
  setTimeout(renderDirectoryHistory,0);
}
function renderDirectoryHistory(){
  document.getElementById('directory-recent-searches').innerHTML=directoryHistory.searches.length?directoryHistory.searches.map(function(query){
    return '<button type="button" class="directory-recent-search" data-directory-search="'+esc(query)+'">'+esc(query)+'</button>';
  }).join(''):'<p class="directory-history-empty">尚無搜尋紀錄</p>';
  document.getElementById('directory-recent-calls').innerHTML=directoryHistory.calls.length?directoryHistory.calls.map(function(call){return directoryCallLink(directoryContactById[call.id],call.number,true);}).join(''):'<p class="directory-history-empty">尚無點選紀錄</p>';
  document.querySelector('[data-directory-history-clear="searches"]').hidden=!directoryHistory.searches.length;
  document.querySelector('[data-directory-history-clear="calls"]').hidden=!directoryHistory.calls.length;
}
function updateDirectoryOffsets(){
  document.documentElement.style.setProperty('--directory-header-height',document.querySelector('header').getBoundingClientRect().height+'px');
  var height=document.getElementById('directory-toolbar').getBoundingClientRect().height;
  if(height)document.documentElement.style.setProperty('--directory-toolbar-height',height+'px');
}
function filterDirectory(){
  var input=document.getElementById('directory-search'),query=directoryNormalize(input.value),hasMatches=false;
  if(query&&directorySearchOpenState===null){
    directorySearchOpenState={};document.querySelectorAll('.directory-section,details.directory-group').forEach(function(section){directorySearchOpenState[section.id]=section.open;});
  }
  var rankQuery=/^r[1-4]$/.test(query);
  directoryContacts.forEach(function(contact){var match=!query||(rankQuery?directoryNormalize(contact.rank)===query:contact.search.indexOf(query)!==-1);contact.element.hidden=!match;if(match)hasMatches=true;});
  document.querySelectorAll('[data-directory-rank-heading]').forEach(function(heading){
    heading.hidden=!heading.parentElement.querySelector('.directory-contact[data-directory-rank="'+heading.dataset.directoryRankHeading+'"]:not([hidden])');
  });
  document.querySelectorAll('.directory-note').forEach(function(note){note.hidden=!!query&&note.dataset.search.indexOf(query)===-1;if(!note.hidden)hasMatches=true;});
  document.querySelectorAll('.directory-group').forEach(function(group){
    var contacts=group.querySelectorAll('.directory-contact:not([hidden])'),notes=group.querySelectorAll('.directory-note:not([hidden])');
    group.hidden=!contacts.length&&!notes.length;
    var noteBox=group.querySelector('.directory-notes');if(noteBox)noteBox.hidden=!notes.length;
    if(group.tagName==='DETAILS'){
      if(query)group.open=!group.hidden;
      else if(directorySearchOpenState!==null)group.open=!!directorySearchOpenState[group.id];
    }
  });
  document.querySelectorAll('.directory-section').forEach(function(section){
    section.hidden=!section.querySelector('.directory-group:not([hidden])');
    if(query)section.open=!section.hidden;
    else if(directorySearchOpenState!==null)section.open=!!directorySearchOpenState[section.id];
  });
  if(!query)directorySearchOpenState=null;
  document.getElementById('directory-clear').hidden=!input.value;
  document.getElementById('directory-empty').hidden=hasMatches;
}
function openDirectoryJump(){
  closeMenu();directoryJumpRestoreFocus=true;renderDirectoryJump();
  document.getElementById('directory-jump-dialog').showModal();
  updateDirectoryJumpLayout();
  document.body.classList.add('directory-jump-open');
  document.getElementById('directory-quick-trigger').setAttribute('aria-expanded','true');
  document.querySelector('.directory-jump-button').focus();
}
function closeDirectoryJump(){document.getElementById('directory-jump-dialog').close();}
function updateDirectoryJumpLayout(){
  var grid=document.getElementById('directory-jump-grid');
  if(!grid)return;
  var columns=window.matchMedia('(min-width:861px)').matches?3:2;
  grid.style.setProperty('--directory-jump-rows',Math.ceil(grid.children.length/columns));
}
window.addEventListener('resize',updateDirectoryJumpLayout);
function renderDirectoryJump(sectionId){
  var section=DIRECTORY_DATA.sections.find(function(item){return item.id===sectionId;}),grid=document.getElementById('directory-jump-grid');
  document.getElementById('directory-jump-back').hidden=!section;
  document.getElementById('directory-jump-title').textContent=section?section.name:'快速轉跳';
  grid.innerHTML=section?section.groups.map(function(group){
    return '<button type="button" class="directory-jump-button" data-directory-tone="'+group.tone+'" data-directory-group="'+group.id+'" data-directory-parent="'+section.id+'"><span>'+esc(group.name)+'</span></button>';
  }).join(''):DIRECTORY_DATA.sections.map(function(item){
    return '<button type="button" class="directory-jump-button" data-directory-tone="'+item.tone+'" data-directory-section="'+item.id+'"><span>'+esc(item.name)+'</span></button>';
  }).join('');
  grid.dataset.level=section?'emergency':'main';
  updateDirectoryJumpLayout();grid.scrollTop=0;
}
function directoryJumpTo(id,groupId){
  var section=document.getElementById(id);if(!section)return;
  clearTimeout(directorySearchTimer);document.getElementById('directory-search').value='';filterDirectory();section.open=true;
  var target=groupId?document.getElementById(groupId):section;
  if(!target)return;
  if(groupId)target.open=true;
  else section.querySelectorAll('details.directory-group').forEach(function(group){group.open=true;});
  directoryJumpRestoreFocus=false;closeDirectoryJump();
  requestAnimationFrame(function(){
    updateDirectoryOffsets();
    var offset=document.querySelector('header').getBoundingClientRect().height+document.getElementById('directory-toolbar').getBoundingClientRect().height+12;
    var top=target.getBoundingClientRect().top+window.scrollY-offset;
    target.querySelector('summary').focus({preventScroll:true});
    window.scrollTo({top:Math.max(0,top),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
}
document.addEventListener('pointerdown',function(event){directoryCallPointerActive=!!event.target.closest('a[data-directory-number]');},true);
document.addEventListener('pointerup',function(){setTimeout(function(){directoryCallPointerActive=false;},0);},true);
document.addEventListener('pointercancel',function(){directoryCallPointerActive=false;},true);
document.addEventListener('click',function(event){
  var call=event.target.closest('a[data-directory-number]');
  if(call){
    call.setAttribute('href','tel:'+directoryDialNumber(call.dataset.directoryNumber,call.dataset.emergency==='1',true));
    rememberDirectoryCall(call.dataset.directoryContact,call.dataset.directoryNumber);
  }
  var jump=event.target.closest('button[data-directory-section]');
  if(jump)directoryJumpTo(jump.dataset.directorySection);
  var subgroup=event.target.closest('button[data-directory-group]');if(subgroup)directoryJumpTo(subgroup.dataset.directoryParent,subgroup.dataset.directoryGroup);
  var recentSearch=event.target.closest('button[data-directory-search]');
  if(recentSearch){
    var search=document.getElementById('directory-search');clearTimeout(directorySearchTimer);search.value=recentSearch.dataset.directorySearch;
    filterDirectory();rememberDirectorySearch(search.value);search.focus({preventScroll:true});
  }
  var clearHistory=event.target.closest('button[data-directory-history-clear]');
  if(clearHistory){directoryHistory[clearHistory.dataset.directoryHistoryClear]=[];saveDirectoryHistory();renderDirectoryHistory();}
});

export function initDirectory(options = {}) {
  closeMenu = options.closeMenu || (() => {});
  buildDirectory();
}

export function refreshDirectoryLayout() {
  updateDirectoryOffsets();
}
