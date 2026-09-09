const api=window.pulseAPI;
const message=document.getElementById('message');
const root=document.getElementById('accounts');
const attempts=new Map();
let currentConfig;
async function action(fn) {try {message.textContent='';await fn();await load();} catch(error) {message.textContent=String(error);}}
function button(label,fn) {const button=document.createElement('button');button.textContent=label;button.addEventListener('click',()=>action(fn));return button;}
async function load() {
  const config=await api.getConfig();currentConfig=config;
  document.getElementById('dock-side').value=config.dockSide;
  document.getElementById('countdown-mode').value=config.countdownMode;
  document.getElementById('demo-mode').value=String(config.demoMode);
  const [capabilities,auth,data]=await Promise.all([api.getProviderCapabilities(),api.getAuthStatus(),api.getProviderStatus()]);
  root.replaceChildren();
  for(const provider of capabilities) {
    const section=document.createElement('section');const title=document.createElement('h2');title.textContent=provider.name;section.append(title);
    const enabledLabel=document.createElement('label');const enabled=document.createElement('input');enabled.type='checkbox';enabled.id=`enabled-${provider.id}`;enabled.checked=config.providers.find(item=>item.id===provider.id)?.enabled??false;enabledLabel.append(enabled,' 启用此数据源');section.append(enabledLabel);
    const state=auth.find(a=>a.id===provider.id);const status=document.createElement('p');status.textContent=state?.message||(state?.configured?`已保存凭据 · ${state.mode}`:'未配置独立凭据');section.append(status);
    if(provider.apiKey) {
      const label=document.createElement('label');label.textContent='API Key';const input=document.createElement('input');input.type='password';input.autocomplete='off';input.placeholder='留空不修改已保存的 Key';label.append(input);section.append(label);
      section.append(button('保存 Key',async()=>{await api.saveApiKey(provider.id,input.value.trim());input.value='';}));
      section.append(button('清除凭据',()=>api.logout(provider.id)));
    }
    const login=button('登录',async()=>{const attempt=await api.startLogin(provider.id);attempts.set(provider.id,attempt.attemptId);if(!message.textContent) message.textContent=attempt.message;});login.disabled=!provider.login||attempts.has(provider.id);section.append(login);
    if(attempts.has(provider.id)) section.append(button('取消登录',async()=>{await api.cancelLogin(attempts.get(provider.id));attempts.delete(provider.id);}));
    const note=document.createElement('p');note.textContent=provider.loginStatus||'';section.append(note);
    if(provider.id==='glm') {const label=document.createElement('label');label.textContent='GLM 站点 ';const select=document.createElement('select');for(const [value,text] of [['cn','BigModel 国内站'],['international','Z.ai 国际站']]) {const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=config.glmRegion;select.addEventListener('change',()=>action(()=>api.saveConfig({...config,glmRegion:select.value})));label.append(select);section.append(label);}
    if(provider.id==='cursor') {const label=document.createElement('label');label.textContent='Cursor 用户数据目录（可选）';const input=document.createElement('input');input.value=config.cursorDataDir||'';input.placeholder='默认自动检测；自定义目录请输入绝对路径';label.append(input);section.append(label,button('保存目录',()=>api.saveConfig({...config,cursorDataDir:input.value.trim()||null})));}
    const metric=data.find(d=>d.id===provider.id);const display=document.createElement('div');display.className='data';
    display.textContent=!metric?'该渠道未启用':metric.kind==='unavailable'?metric.message:metric.kind==='balance'?metric.balances.map(b=>`${b.currency} ${b.amount}`).join('\n'):(metric.demo?'演示数据\n':'')+metric.windows.map(w=>`${w.name}: ${w.used}% 已用${w.reset?' · 重置 '+new Date(typeof w.reset==='number'?w.reset*(w.reset<1e12?1000:1):w.reset).toLocaleString():''}`).join('\n');
    if(metric?.plan) display.textContent = `套餐：${metric.plan}\n` + display.textContent;
    if(metric?.creditsUnlimited===true) display.textContent += '\n积分不限量';
    else if(metric?.creditBalance!=null) display.textContent += `\n积分余额：${metric.creditBalance}`;
    section.append(display);root.append(section);
  }
}
document.getElementById('refresh').addEventListener('click',()=>action(load));
document.getElementById('save-settings').addEventListener('click',async event=>{
  const button=event.currentTarget;if(button.disabled||!currentConfig)return;button.disabled=true;message.textContent='保存中…';
  try {currentConfig=await api.saveConfig({...currentConfig,dockSide:document.getElementById('dock-side').value,countdownMode:document.getElementById('countdown-mode').value,demoMode:document.getElementById('demo-mode').value==='true',providers:currentConfig.providers.map(provider=>({...provider,enabled:document.getElementById(`enabled-${provider.id}`)?.checked??provider.enabled}))});message.textContent='设置已保存';}
  catch(error) {message.textContent=`保存失败：${String(error)}`;}
  finally {button.disabled=false;}
});
api.onAuthUpdate(()=>load().catch(error=>message.textContent=String(error)));
api.onLoginUpdate(event=>{message.textContent=event.message;if(event.status!=='pending') {for(const [id,attempt] of attempts) {if(attempt===event.attemptId) attempts.delete(id);}load().catch(error=>message.textContent=String(error));}});
load().catch(error=>message.textContent=String(error));
