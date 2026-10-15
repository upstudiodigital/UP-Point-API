import "dotenv/config";
import prisma from "../src/prisma";
import {readFile,writeFile} from "node:fs/promises";
async function main(){
 if(!/127\.0\.0\.1:5434\/uppoint_dev$/.test(process.env.DATABASE_URL ?? ""))throw Error("Only local QA");
 const a=JSON.parse(await readFile('../.local/qa-inline-account.json','utf8'));
 const user=await prisma.users.findUniqueOrThrow({where:{id:a.userId}});
 if(user.name!=="QA UP Point" || !user.email?.startsWith('qa-') || !user.email.endsWith('@example.test'))throw Error('Unexpected fixture');
 const orderIds=[a.orderId,a.cardOrderId].filter(Boolean),eventIds=[a.eventId,a.cardEventId].filter(Boolean);
 const card=await prisma.adOrder.findUniqueOrThrow({where:{id:a.cardOrderId}});
 const receipts=await prisma.paymentEmail.findMany({where:{orderId:a.cardOrderId},select:{recipientType:true,sentAt:true}});
 const proof={sandboxCard:{status:card.status,method:card.paymentMethod,confirmed:!!card.providerPaymentId},receipts:receipts.map(x=>({type:x.recipientType,sent:!!x.sentAt})),smtpConfigured:!!process.env.SMTP_HOST,cleanup:'Own synthetic QA fixtures only'};
 await writeFile('../testes/evidencias/2026-10-13/sandbox-validacao.json',JSON.stringify(proof,null,2));
 await prisma.$transaction(async tx=>{await tx.paymentEmail.deleteMany({where:{orderId:{in:orderIds}}});await tx.paymentAttempt.deleteMany({where:{orderId:{in:orderIds}}});await tx.adOrder.deleteMany({where:{id:{in:orderIds},userId:a.userId}});await tx.events.deleteMany({where:{id:{in:eventIds},idUserOwner:a.userId}});await tx.categories.deleteMany({where:{id:a.categoryId,idUserOwner:a.userId}});await tx.users.delete({where:{id:a.userId}});});
 console.log('Sandbox card paid; two receipts queued; synthetic local fixtures removed.');
}main().finally(()=>prisma.$disconnect());
