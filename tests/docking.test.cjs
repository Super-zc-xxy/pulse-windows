const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('config push preserves native collapse state across all dock directions', () => {
  function element() {
    const classes=new Set();
    return {style:{},children:[],addEventListener(){},appendChild(){},
      classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n)},
      get className(){return [...classes].join(' ');},set className(value){classes.clear();value.split(' ').forEach(n=>classes.add(n));}};
  }
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll:()=>[]};
  let onConfig;
  const window={addEventListener(){},pulseAPI:{getConfig:()=>new Promise(()=>{}),onConfigUpdate:fn=>onConfig=fn,onMetricsUpdate(){},onExpandedUpdate(){}}};
  vm.runInNewContext(fs.readFileSync('src/renderer/app.js','utf8'),{document,window,setTimeout:()=>1,clearTimeout(){}});
  const app=document.getElementById('app');const card=document.getElementById('detail-card');
  for(const collapsed of [true,false]) {
    app.className=`dock-right${collapsed?' collapsed':''}`;
    for(const dockSide of ['left','top','right','left']) {
      card.style.left='100px';card.style.top='100px';card.classList.remove('hidden');
      onConfig({dockSide});
      assert.equal(app.classList.contains('collapsed'),collapsed);
      assert.equal(app.className.split(' ').filter(n=>n.startsWith('dock-')).join(),`dock-${dockSide}`);
      assert.equal(card.style.left,'');assert.equal(card.style.top,'');assert.ok(card.classList.contains('hidden'));
    }
  }
});
