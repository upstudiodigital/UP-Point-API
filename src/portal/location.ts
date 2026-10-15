import { Router } from "express";
export const locationTools = Router();
const cache = new Map<string, {until: number; data: unknown}>();
let nextSearch = 0;
let nextWeather = 0;
type Feature={geometry?:{coordinates?:number[]};properties?:{state?:string;countrycode?:string;name?:string;street?:string;housenumber?:string;district?:string;city?:string;postcode?:string;type?:string}};
function places(features:Feature[]) {
 return features.filter(x=>x.properties?.state?.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()==="santa catarina" && x.properties.countrycode?.toUpperCase()==="BR" && x.geometry?.coordinates?.length===2 && x.geometry.coordinates.every(Number.isFinite))
 .map(x=>({latitude:String(x.geometry!.coordinates![1]),longitude:String(x.geometry!.coordinates![0]),street:x.properties!.street || (x.properties!.type==="street" ? x.properties!.name : undefined),number:x.properties!.housenumber,neighborhood:x.properties!.district,city:x.properties!.city,postalCode:x.properties!.postcode,label:[x.properties!.name,x.properties!.street,x.properties!.housenumber,x.properties!.district,x.properties!.city,"SC"].filter(Boolean).join(", "),approximate:!x.properties!.housenumber}));
}
const value=(query:unknown)=>typeof query==="string" ? query.trim().slice(0,350) : "";
async function lookup(params:Record<string,string>,structured=false){
 const base=new URL(process.env.PHOTON_API_URL?.trim() || "https://photon.komoot.io/api/");
 if(structured)base.pathname=base.pathname.replace(/\/api\/?$/,"/structured");
 base.search=new URLSearchParams({...params,countrycode:"BR",limit:"5"}).toString();
 const response=await fetch(base,{headers:{"User-Agent":"UPPoint/1.0 (https://upstudiodigital.com.br)"},signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error();
 const result=await response.json() as {features?:Feature[]};return places(Array.isArray(result.features)?result.features:[]);
}
locationTools.get("/locations/search", async (req,res)=>{
 const street=value(req.query.street),city=value(req.query.city),number=value(req.query.number),postcode=value(req.query.postcode);
 const address=value(req.query.address) || [street,number,city].filter(Boolean).join(", ");
 if(street ? street.length<3 || city.length<2 : address.length<8)return res.status(400).json({message:"Informe o endereço e a cidade."});
 const key=JSON.stringify([address,street,city,number,postcode]);const saved=cache.get(key);
 if(saved && saved.until>Date.now())return res.json(saved.data);
 if(Date.now()<nextSearch)return res.status(429).json({message:"Aguarde um momento antes de consultar novamente."});
 nextSearch=Date.now()+1100;
 try {
  let results=street && city ? await lookup({street,city,state:"Santa Catarina",...(number?{housenumber:number}:{}),...(postcode?{postcode}: {})},true).catch((): ReturnType<typeof places>=>[]) : [];
  if(!results.length)results=await lookup({q:[address,city,"Santa Catarina"].filter(Boolean).join(", "),lat:"-27.5954",lon:"-48.548"});
  if(!results.length){await new Promise(resolve=>setTimeout(resolve,1100));results=await lookup({q:[street || address.replace(/\b\d+[\d-]*\b/g,"").replace(/,+/g," "),city,"Santa Catarina"].filter(Boolean).join(" ")});results=results.map(x=>({...x,approximate:true}));}
  const data={results};if(results.length){if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(key,{data,until:Date.now()+86400000});}
  return res.json(data);
 }catch{return res.status(503).json({message:"Não foi possível consultar agora. Tente novamente."});}
});
locationTools.get("/weather/forecast", async (req, res) => {
  const lat = Number(req.query.latitude), lon = Number(req.query.longitude);
  const date = typeof req.query.date === "string" ? req.query.date : "";
  if (!req.query.latitude || !req.query.longitude || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({message: "Selecione a data e confirme o local no mapa."});
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const days = (Date.parse(date) - Date.parse(today)) / 86400000;
  if (!Number.isInteger(days) || days < 0 || days > 15) return res.json({available:false});
  if (process.env.NODE_ENV === "production" && !process.env.OPEN_METEO_API_KEY) return res.status(503).json({message:"Não foi possível consultar agora. Tente novamente."});
  const key = `weather:${lat.toFixed(4)}:${lon.toFixed(4)}:${date}`;
  const saved = cache.get(key); if (saved && saved.until>Date.now()) return res.json(saved.data);
  if(Date.now()<nextWeather) return res.status(429).json({message:"Aguarde um momento antes de consultar novamente."});
  nextWeather=Date.now()+1000;
  try {
    const url = new URL(process.env.OPEN_METEO_API_KEY ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({latitude:String(lat),longitude:String(lon),start_date:date,end_date:date,timezone:"America/Sao_Paulo",daily:"temperature_2m_max,temperature_2m_min,precipitation_probability_max", ...(process.env.OPEN_METEO_API_KEY ? {apikey:process.env.OPEN_METEO_API_KEY} : {})}).toString();
    const response = await fetch(url,{signal:AbortSignal.timeout(7000)}); if (!response.ok) throw Error();
    const result = await response.json() as {daily: {temperature_2m_max:(number|null)[];temperature_2m_min:(number|null)[];precipitation_probability_max:(number|null)[]}};
    const data={available:true,min:result.daily.temperature_2m_min[0],max:result.daily.temperature_2m_max[0],rain:result.daily.precipitation_probability_max[0],date};
    if (cache.size>=200) cache.delete(cache.keys().next().value!);
    cache.set(key,{data,until:Date.now()+900000}); return res.json(data);
  } catch {return res.status(503).json({message:"Não foi possível consultar agora. Tente novamente."});}
});
