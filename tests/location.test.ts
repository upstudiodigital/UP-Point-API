import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {locationTools} from "../src/portal/location";
test("location tools restrict SC, cache results and avoid forecasts outside the horizon", async () => {
  const original = globalThis.fetch;
  let calls=0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url=String(input);
    if(url.startsWith("https://photon.komoot.io/")) {
      calls++; return new Response(JSON.stringify({features:[
        {geometry:{coordinates:[-48.5,-27.6]},properties:{state:"Santa Catarina",countrycode:"BR",name:"Arena de teste",city:"Florianópolis"}},
        {geometry:{coordinates:[-46.6,-23.5]},properties:{state:"São Paulo",countrycode:"BR",name:"Fora de SC"}}
      ]}),{status:200});
    }
    if(url.startsWith("https://api.open-meteo.com/")) {calls++;return new Response(JSON.stringify({daily:{temperature_2m_min:[12],temperature_2m_max:[24],precipitation_probability_max:[40]}}),{status:200});}
    return original(input,init);
  }) as typeof fetch;
  const app=express();app.use(locationTools);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base+"/locations/search?address=x")).status,400);
    const route="/locations/search?address=Rua%20ficticia%20123%20Florianopolis";
    const result=await (await fetch(base+route)).json() as {results:unknown[]};assert.equal(result.results.length,1);
    await fetch(base+route);assert.equal(calls,1);
    assert.equal((await fetch(base+"/weather/forecast?latitude=&longitude=&date=2026-10-12")).status,400);
    const far=await (await fetch(base+"/weather/forecast?latitude=-27.6&longitude=-48.5&date=2099-01-01")).json();assert.equal(far.available,false);assert.equal(calls,1);
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const forecast=await (await fetch(base+`/weather/forecast?latitude=-27.6&longitude=-48.5&date=${date}`)).json();assert.equal(forecast.rain,40);assert.equal(forecast.available,true);
    await fetch(base+`/weather/forecast?latitude=-27.6&longitude=-48.5&date=${date}`);assert.equal(calls,2);
  } finally {globalThis.fetch=original;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
