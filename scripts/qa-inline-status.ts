import "dotenv/config";
import {readFile} from "node:fs/promises";
import prisma from "../src/prisma";
async function main(){const account=JSON.parse(await readFile('../.local/qa-inline-account.json','utf8'));const attempt=await prisma.paymentAttempt.findUnique({where:{orderId:account.orderId},select:{id:true,method:true,result:true}});console.log({attemptId:attempt?.id,method:attempt?.method,hasResult:!!attempt?.result});}
main().finally(()=>prisma.$disconnect());
