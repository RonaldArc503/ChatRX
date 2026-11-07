import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, collection, getDocs, getFirestore, query, where } from 'firebase/firestore';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088')throw Error('Local test only');
const response=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'agents-demo@example.test',password:'TasklyLocal-2026!',returnSecureToken:true})});
const owner=await response.json();if(!response.ok)throw Error('Local owner sign-in failed');
const app=initializeApp({projectId:'demo-taskly-music',apiKey:'fake-key',appId:'ui-fixture'},'ui-fixture');
const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8088,{mockUserToken:{sub:owner.localId}});
const projects=await getDocs(query(collection(db,'agentWorkspaces'),where('ownerUid','==',owner.localId)));
const project=projects.docs.find(item=>item.data().name==='Laboratorio de servidores');if(!project)throw Error('Create the UI project first');
const agents=await getDocs(collection(project.ref,'agents'));
const agent=agents.docs.find(item=>item.data().name==='IA-PC2');if(!agent)throw Error('Create the second UI agent first');
const renewal=await fetch(`http://127.0.0.1:8787/api/agents/workspaces/${project.id}/agents/${agent.id}/token`,{method:'POST',headers:{Authorization:`Bearer ${owner.idToken}`,'Content-Type':'application/json'},body:'{}'});
const {token}=await renewal.json();if(!renewal.ok)throw Error('Local renewal failed');
const client=new Client({name:'PC2-local-demo',version:'1.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 const inbox=await client.callTool({name:'read_agent_inbox',arguments:{}});
 const question=JSON.parse(inbox.content[0].text).questions[0];if(!question)throw Error('Send a question to IA-PC2 first');
 const context=await client.callTool({name:'get_project_context',arguments:{key:'dns-01'}});
 const version=JSON.parse(context.content[0].text).context.version;
 const reply=await client.callTool({name:'reply_to_agent_request',arguments:{questionId:question.id,text:`Según el contexto Servidor DNS-01 (v${version}), Ubuntu Server y la red interna ya están preparados. Queda configurar el servicio DNS y comprobar la resolución desde la segunda PC. Esta respuesta usa los datos ficticios publicados en el proyecto.`,requestId:crypto.randomUUID()}});
 if(reply.isError)throw Error('Local MCP reply failed');
 console.log('PASS: IA-PC2 read shared context and answered the browser question over real MCP.');
}finally{await client.close();await deleteApp(app);}
