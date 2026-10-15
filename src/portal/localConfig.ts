import type { Request } from "express";
export function allowedOrigin(origin: string | undefined, production = process.env.NODE_ENV === "production") {
  if (!origin) return true;
  const configured = (process.env.FRONTEND_ORIGINS ?? "").split(",").map(x=>x.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;
  if (production) return false;
  try {const url=new URL(origin);return ["http:","https:"].includes(url.protocol) && ["localhost","127.0.0.1","[::1]"].includes(url.hostname) && url.origin===origin;}catch{return false;}
}
export function serverPorts(args = process.argv.slice(2)) {
  const index=args.indexOf("--port");
  const explicit=args.find(x=>x.startsWith("--port="))?.slice(7) ?? (index>=0 ? args[index+1] : undefined);
  if(index>=0 && !explicit) throw Error("Informe a porta depois de --port.");
  const raw=explicit ?? (process.env.PORTS?.trim() || process.env.PORT?.trim() || "3333");
  const values=raw.split(",").map(x=>Number(x.trim()));
  if(!values.length || values.some(x=>!Number.isInteger(x)||x<1024||x>65535)) throw Error("Informe uma porta entre 1024 e 65535 usando --port ou PORT/PORTS.");
  return [...new Set(values)];
}
export function uploadUrl(req:Request,filename:string) {
  return `${process.env.PUBLIC_API_URL?.trim() || `http://127.0.0.1:${req.socket.localPort ?? process.env.PORT ?? 3333}`}/uploads/${filename}`;
}
