import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { writeFile } from "node:fs/promises";
import prisma from "../src/prisma";
async function main(){
 if(!(process.env.DATABASE_URL??"").endsWith("127.0.0.1:5434/uppoint_dev"))throw Error("Somente desenvolvimento local.");
 const password=randomBytes(18).toString("hex"),email="admin@example.test";
 await prisma.users.upsert({where:{id:"development-admin"},create:{id:"development-admin",name:"Administrador de demonstração",email,password:await hash(password,12),typeAccess:"admin"},update:{password:await hash(password,12),typeAccess:"admin",status:true}});
 await writeFile("../.local/admin-account.json",JSON.stringify({email,password},null,2));
 console.log("Conta administrativa local salva em .local/admin-account.json");
}
void main().finally(()=>prisma.$disconnect());
