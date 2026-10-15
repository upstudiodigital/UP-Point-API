import "dotenv/config";
import {createConnection} from "node:net";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
async function reachable(host:string,port:number){return new Promise<boolean>(resolve=>{
 const socket=createConnection({host,port});let done=false;
 const finish=(value:boolean)=>{if(done)return;done=true;socket.destroy();resolve(value);};
 socket.setTimeout(1500);socket.once("connect",()=>finish(true));socket.once("error",()=>finish(false));socket.once("timeout",()=>finish(false));
});}
async function main(){
 if(!process.env.DATABASE_URL)throw Error("Configure DATABASE_URL no .env da API.");
 const database=new URL(process.env.DATABASE_URL);
 const port=Number(database.port || 5432);
 if(!await reachable(database.hostname,port)){
  const workspace=path.resolve(process.cwd(),"..");
  const executable=path.join(workspace,".local","pg-runtime","pgsql","bin","pg_ctl.exe");
  if(process.platform!=="win32" || database.hostname!=="127.0.0.1" || port!==5434 || database.pathname!=="/uppoint_dev" || !existsSync(executable))
   throw Error("Banco indisponível. Inicie o PostgreSQL configurado no .env e tente novamente.");
  console.log("Iniciando PostgreSQL local do projeto...");
  await new Promise<void>((resolve,reject)=>{
   const child=spawn(executable,["-D",path.join(workspace,".local","pgdata"),"-l",path.join(workspace,".local","postgres.log"),"-o","-h 127.0.0.1 -p 5434","start"],{stdio:"inherit",windowsHide:true});
   child.once("error",()=>reject(Error("Não foi possível iniciar o PostgreSQL local.")));
   child.once("exit",code=>code===0 ? resolve() : reject(Error("PostgreSQL não iniciou. Confira .local/postgres.log.")));
  });
 }
 const child=spawn(process.execPath,[path.resolve("node_modules/tsx/dist/cli.mjs"),"watch","src/server.ts",...process.argv.slice(2)],{stdio:"inherit",windowsHide:true});
 child.once("error",()=>{console.error("Não foi possível iniciar a API. Execute npm install.");process.exitCode=1;});
 child.once("exit",code=>{process.exitCode=code ?? 0;});
}
void main().catch((error:Error)=>{console.error(error.message);process.exitCode=1;});
