import "dotenv/config";
import prisma from "../src/prisma";
import { randomUUID,randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { writeFile,mkdir } from "node:fs/promises";
import path from "node:path";
async function main(){
 if(!/127\.0\.0\.1:5434\/uppoint_dev$/.test(process.env.DATABASE_URL ?? ""))throw Error("Only local development");
 const userId=randomUUID(),categoryId=randomUUID(),eventId=randomUUID(),orderId=randomUUID(),password=randomBytes(18).toString("hex"),email=`qa-${userId}@example.test`;
 await prisma.users.create({data:{id:userId,name:"QA UP Point",email,password:await hash(password,12),cpfCnpj:"12345678909",phone:"11999999999",freeAdUsed:true}});
 await prisma.categories.create({data:{id:categoryId,name:"QA interno",idUserOwner:userId}});
 await prisma.events.create({data:{id:eventId,idUserOwner:userId,idCategory:categoryId,name:"QA • pagamento de demonstração",description:"Evento sintético exclusivo para testes locais. Não publicar.",localityEvent:"Local demonstrativo",urlLocalityEvent:"",bannerImageUrl:"/images/festival-hero.png",dateEvent:"2026-11-01",hourEvent:"20:00",city:"Florianópolis"}});
 await prisma.adOrder.create({data:{id:orderId,userId,eventId,placement:"cards",amountCents:1000}});
 const dir=path.resolve("../.local");await mkdir(dir,{recursive:true});await writeFile(path.join(dir,"qa-inline-account.json"),JSON.stringify({userId,categoryId,eventId,orderId,email,password}));console.log("Synthetic private QA account and order created locally.");
}
main().finally(()=>prisma.$disconnect());
