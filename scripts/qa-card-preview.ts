import "dotenv/config";
import prisma from "../src/prisma";
import {readFile,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
async function main(){
 if(!/127\.0\.0\.1:5434\/uppoint_dev$/.test(process.env.DATABASE_URL ?? ""))throw Error("Local only");
 const file='../.local/qa-inline-account.json';const account=JSON.parse(await readFile(file,'utf8'));const eventId=randomUUID(),orderId=randomUUID();
 await prisma.events.create({data:{id:eventId,idUserOwner:account.userId,idCategory:account.categoryId,name:"QA • cartão de demonstração",description:"Evento sintético exclusivo para testes locais. Não publicar.",localityEvent:"Local demonstrativo",urlLocalityEvent:"",bannerImageUrl:"/images/festival-hero.png",dateEvent:"2026-11-01",hourEvent:"20:00",city:"Florianópolis"}});
 await prisma.adOrder.create({data:{id:orderId,userId:account.userId,eventId,placement:"cards",amountCents:1000}});
 await writeFile(file,JSON.stringify({...account,cardOrderId:orderId,cardEventId:eventId}));console.log("Synthetic card order created.");
}main().finally(()=>prisma.$disconnect());
