const base=process.argv[2]||"http://127.0.0.1:3333";
async function main(){
 const url=new URL(base);if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw Error("Smoke restrito ao ambiente local.");
 for(const route of ["/health","/ready"]){const response=await fetch(base+route,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error("Serviço indisponível.");}
 const durations:number[]=[];let failures=0;
 for(let batch=0;batch<10;batch++)await Promise.all(Array.from({length:5},async()=>{const start=performance.now();try{const response=await fetch(base+"/events",{signal:AbortSignal.timeout(10000)});await response.text();if(!response.ok)failures++;}catch{failures++;}durations.push(performance.now()-start);}));
 durations.sort((a,b)=>a-b);
 console.log(JSON.stringify({requests:50,concurrency:5,failures,p95Ms:Math.round(durations[Math.ceil(durations.length*.95)-1]),scope:"local read-only smoke; not production capacity"}));
 if(failures)process.exitCode=1;
}
void main().catch(()=>{console.error("Smoke local falhou.");process.exitCode=1;});
