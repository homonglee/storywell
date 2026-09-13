const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const base = 'http://localhost:3147';
const password = 'local-only-login-verification';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3147'], { cwd:process.cwd(), env:{...process.env, STORYWELL_ACCESS_PASSWORD:password, DATABASE_URL:'', POSTGRES_URL:'', OPENAI_API_KEY:''}, windowsHide:true, stdio:['ignore','pipe','pipe'] });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk.toString(); });
server.stderr.on('data', chunk => { logs += chunk.toString(); });
const request = (url, options={}) => fetch(base + url, { redirect:'manual', ...options });
(async()=>{
  try {
    let ready=false;
    for(let i=0;i<60;i++){
      if(server.exitCode!==null) throw new Error('Test server exited: '+logs);
      try { const r=await request('/login'); if(r.status===200){ready=true;break;} } catch {}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.ok(ready,'Local build starts');
    const root=await request('/');
    assert.equal(root.status,303); assert.equal(new URL(root.headers.get('location'),base).href,base+'/login');
    assert.equal(root.headers.has('www-authenticate'),false);
    const form=await request('/login');
    const html=await form.text();
    assert.ok(html.includes('작업실 들어가기')); assert.ok(html.includes('name="password"'));
    const api=await request('/api/ai/status'); assert.equal(api.status,401);
    const login=async(value)=>request('/api/auth/login',{method:'POST',headers:{origin:base},body:new URLSearchParams({username:'storywell',password:value})});
    const wrong=await login('incorrect');
    assert.equal(wrong.status,303, 'incorrect password: '+await wrong.text()); assert.equal(new URL(wrong.headers.get('location'),base).href,base+'/login?error=invalid');
    const error=await request('/login?error=invalid'); assert.ok((await error.text()).includes('비밀번호가 일치하지 않습니다'));
    const success=await login(password);
    assert.equal(success.status,303); assert.equal(new URL(success.headers.get('location'),base).href,base+'/');
    const cookie=success.headers.get('set-cookie').split(';')[0];
    for(let i=0;i<2;i++){
      const workspace=await request('/',{headers:{cookie}});
      assert.equal(workspace.status,200);
      const content=await workspace.text();
      assert.ok(content.includes('StoryWell Ver2.0')); assert.ok(content.includes('로그아웃'));
    }
    const status=await request('/api/ai/status',{headers:{cookie}}); assert.equal(status.status,200);
    const loggedOut=await request('/api/auth/logout',{method:'POST',headers:{origin:base,cookie}});
    assert.equal(loggedOut.status,303); assert.ok(loggedOut.headers.get('set-cookie').includes('Max-Age=0'));
    const cleared=loggedOut.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/ai/status',{headers:{cookie:cleared}})).status,401);
    console.log('PASS: real Next.js HTTP login page, error, cookie session, authenticated refresh, API gate and logout. Local dummy credentials only; no database or AI request.');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    server.kill();
    if(server.exitCode===null) await once(server,'exit');
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
