import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import prisma from "../src/prisma";

test("moderação, gratuidade concorrente, preço autoritativo, privilégios e histórico",{skip:process.env.RUN_INTEGRATION!=="1"},async()=>{
 assert.match(process.env.DATABASE_URL??"",/127\.0\.0\.1:5434\/uppoint_dev$/);
 const base="http://127.0.0.1:3333",users:string[]=[],events:string[]=[],files:string[]=[];
 const headers=(token:string)=>({Authorization:`Bearer ${token}`});
 const json=(route:string,body:unknown,token:string,method="PATCH")=>fetch(base+route,{method,headers:{...headers(token),"Content-Type":"application/json"},body:JSON.stringify(body)});
 const register=async()=>{const response=await json("/auth/register",{name:"Teste Dashboard",email:`test-${randomUUID()}@example.test`,password:"Testing12345!",acceptTerms:true},"","POST");assert.equal(response.status,201,await response.clone().text());const data=await response.json() as {token:string;user:{id:string}};users.push(data.user.id);return data;};
 const create=async(token:string,placement="cards")=>{
  const form=new FormData();const input={name:"Evento teste Dashboard",category:"Shows",venue:"Arena teste",streetAddress:"Rua teste 123 Centro",city:"Florianópolis",state:"SC",date:"2027-01-26",time:"20:00",phone:"48999999999",description:"Este evento foi criado apenas para testar os painéis.",artists:"Artista A\nArtista B",ticketUrl:"https://example.test/ingresso",latitude:"-27.5954",longitude:"-48.548",placement,amountCents:"0"};
  Object.entries(input).forEach(([key,value])=>form.append(key,value));
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRmsAAAAASUVORK5CYII=","base64");form.append("bannerEvento",new Blob([png],{type:"image/png"}),"test.png");
  const response=await fetch(base+"/events",{method:"POST",headers:headers(token),body:form});assert.equal(response.status,201,await response.clone().text());
  const data=await response.json() as {event:{id:string;bannerImageUrl:string};order:{amountCents:number;status:string}};events.push(data.event.id);files.push(path.basename(data.event.bannerImageUrl));return data;
 };
 try {
  const client=await register(),other=await register(),administrator=await register();
  const profileBody=new FormData();profileBody.append("name","Nome atualizado");profileBody.append("phone","48999999999");
  profileBody.append("typeAccess","admin");
  const avatar=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRmsAAAAASUVORK5CYII=","base64");
  profileBody.append("avatar",new Blob([avatar],{type:"image/png"}),"avatar.png");
  const profileResponse=await fetch(base+"/account/profile",{method:"PATCH",headers:headers(client.token),body:profileBody});
  assert.equal(profileResponse.status,200);
  const profile=await profileResponse.json() as {user:{name:string;profileAvatar:string;typeAccess:string}};
  assert.equal(profile.user.name,"Nome atualizado");assert.equal(profile.user.typeAccess,"client");files.push(path.basename(profile.user.profileAvatar));
  assert.equal((await fetch(profile.user.profileAvatar)).status,200);
  await prisma.users.update({where:{id:administrator.user.id},data:{typeAccess:"admin"}});
  assert.equal((await fetch(base+"/admin/dashboard",{headers:headers(client.token)})).status,403);
  const created=await Promise.all([create(client.token),create(client.token)]);
  assert.deepEqual(created.map(x=>x.order.amountCents).sort((a,b)=>a-b),[0,1000]);
  const free=created.find(x=>x.order.amountCents===0)!,paid=created.find(x=>x.order.amountCents===1000)!;
  assert.equal((await fetch(base+`/account/events/${free.event.id}`,{headers:headers(other.token)})).status,404);
  assert.equal(free.order.status,"free");assert.equal(paid.order.status,"awaiting_configuration");
  assert.equal((await fetch(base+`/events/${free.event.id}`)).status,404);
  assert.equal((await json(`/admin/events/${free.event.id}`,{operation:"approve"},client.token)).status,403);
  assert.equal((await json(`/admin/events/${paid.event.id}`,{operation:"approve"},administrator.token)).status,409);
  assert.equal((await json(`/admin/events/${free.event.id}`,{operation:"approve"},administrator.token)).status,200);
  const publicEvent=await (await fetch(base+`/events/${free.event.id}`)).json() as {event:{artists:string[];ticketUrl:string;latitude:number}};
  assert.deepEqual(publicEvent.event.artists,["Artista A","Artista B"]);assert.equal(publicEvent.event.latitude,-27.5954);assert.equal(publicEvent.event.ticketUrl,"https://example.test/ingresso");
  const foreign=await (await fetch(base+"/account/dashboard",{headers:headers(other.token)})).json() as {events:unknown[];orders:unknown[]};assert.equal(foreign.events.length,0);assert.equal(foreign.orders.length,0);
  const carousel=await create(other.token,"carousel");assert.equal(carousel.order.amountCents,5000);
  // Synthetic confirmation fixture only; no payment provider or real transfer is used.
  await prisma.adOrder.update({where:{eventId:carousel.event.id},data:{status:"paid",paidAt:new Date()}});
  assert.equal((await json(`/admin/events/${carousel.event.id}`,{operation:"approve"},administrator.token)).status,200);
  const featured=await (await fetch(base+"/events/featured")).json() as {events:{id:string}[]};
  assert.ok(featured.events.some(e=>e.id===carousel.event.id));
  const firstCard=await create(other.token);assert.equal(firstCard.order.amountCents,0);
  assert.equal((await json(`/admin/events/${firstCard.event.id}`,{operation:"reject",reason:"Confira a data do evento"},administrator.token)).status,200);
  const customer=await (await fetch(base+"/account/dashboard",{headers:headers(other.token)})).json() as {events:{moderationReason:string|null}[];freeAvailable:boolean};assert.equal(customer.freeAvailable,false);assert.ok(customer.events.some(x=>x.moderationReason==="Confira a data do evento"));
  assert.equal((await json(`/admin/users/${administrator.user.id}`,{status:false},administrator.token)).status,400);
  assert.equal((await json(`/admin/users/${other.user.id}`,{status:false},administrator.token)).status,204);
  assert.equal((await fetch(base+"/account/dashboard",{headers:headers(other.token)})).status,401);
  await json(`/admin/users/${other.user.id}`,{status:true},administrator.token);
  assert.equal((await json(`/admin/events/${free.event.id}`,{operation:"delete"},administrator.token)).status,200);
  assert.equal((await fetch(base+`/events/${free.event.id}`)).status,404);
  const panel=await (await fetch(base+"/admin/dashboard",{headers:headers(administrator.token)})).json() as {audit:{targetId:string}[];users:Record<string,unknown>[]};assert.ok(panel.audit.some(x=>x.targetId===free.event.id));assert.ok(panel.users.every(x=>!("password" in x)));
 } finally {
  await prisma.adminAudit.deleteMany({where:{actorId:{in:users}}});
  await prisma.adOrder.deleteMany({where:{eventId:{in:events}}});
  await prisma.events.deleteMany({where:{id:{in:events}}});
  await prisma.categories.deleteMany({where:{idUserOwner:{in:users}}});
  await prisma.users.deleteMany({where:{id:{in:users}}});
  for(const file of files)await unlink(path.join(process.cwd(),"uploads",file)).catch(()=>{});
  await prisma.$disconnect();
 }
});
