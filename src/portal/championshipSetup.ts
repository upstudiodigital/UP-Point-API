import type { Prisma } from "@prisma/client";
import { SportError, string, integer, link, scCity } from "./sportRules";
export function parseProgramme(value: unknown, startsOn: string, endsOn: string) {
  let source: unknown = value;
  if (typeof value === "string") { try { source=JSON.parse(value); } catch { throw new SportError(400,"Confira equipes e programação do campeonato."); } }
  if (!source || typeof source !== "object") throw new SportError(400,"Cadastre equipes, rodadas e partidas antes de continuar.");
  const s=source as Record<string,unknown>;
  if (!Array.isArray(s.teams) || s.teams.length<2 || s.teams.length>64 || !Array.isArray(s.matches) || !s.matches.length || s.matches.length>2000) throw new SportError(400,"Cadastre equipes, rodadas e partidas antes de continuar.");
  const teams = s.teams.map((raw: unknown) => {
    const t=raw as Record<string,unknown>;
    if(!t || typeof t!=="object") throw new SportError(400,"Confira equipes e programação do campeonato.");
    const roster=typeof t.roster==="string" ? t.roster.trim() : "";
    const players=roster ? roster.split("\n").filter(x=>x.trim()).map(line=> {
      const [shirt,name,position]=line.split("|").map(x=>x.trim());
      if(!["GK","DEF","MID","FWD"].includes(position)) throw new SportError(400,"Confira as escalações.");
      return {shirt:integer(shirt,1,99),name:string(name,2,120),position};
    }) : [];
    if(players.length>80 || new Set(players.map(p=>p.shirt)).size!==players.length) throw new SportError(400,"Confira as escalações.");
    return {key:string(t.key), name:string(t.name,2,100),crestUrl:link(t.crestUrl),groupName:typeof t.groupName==="string"?t.groupName.trim().slice(0,50):"",players};
  });
  if(new Set(teams.map(t=>t.key)).size!==teams.length || new Set(teams.map(t=>t.name.toLocaleLowerCase())).size!==teams.length) throw new SportError(400,"Esta equipe já está cadastrada.");
  const matches=s.matches.map((raw:unknown)=> {
    const m=raw as Record<string,unknown>;
    if(!m || typeof m!=="object") throw new SportError(400,"Confira equipes e programação do campeonato.");
    const homeKey=string(m.homeKey),awayKey=string(m.awayKey);
    if(homeKey===awayKey || !teams.some(t=>t.key===homeKey) || !teams.some(t=>t.key===awayKey)) throw new SportError(400,"Selecione equipes diferentes e uma rodada desta competição.");
    const date=string(m.date,10,10),time=string(m.time,5,5);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date<startsOn || date>endsOn || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new SportError(400,"A partida deve estar dentro do período desta edição.");
    const officialText=typeof m.officials==="string"?m.officials.trim():"";
    const officials=officialText?officialText.split("\n").filter(x=>x.trim()).map(line=> {
      const [role,...names]=line.split("|"); return {role:string(role,2,100),name:string(names.join("|"),2,120)};
    }):[];
    if(officials.length>12)throw new SportError(400,"Confira a arbitragem.");
    return {homeKey,awayKey,round:integer(m.round,1,200),date,time,venue:string(m.venue,3,200),city:scCity(m.city),address:string(m.address,5,300),officials,officialsConfirmed:m.officialsConfirmed===true};
  });
  return {teams,matches};
}
export async function saveProgramme(tx: Prisma.TransactionClient, competitionId:string, programme:ReturnType<typeof parseProgramme>) {
  const teamIds=new Map<string,string>(),roundIds=new Map<number,string>();
  for(const {key,players,...team} of programme.teams) {
    const saved=await tx.sportTeam.create({data:{competitionId,...team,players:{create:players}}}); teamIds.set(key,saved.id);
  }
  for(const number of new Set(programme.matches.map(m=>m.round))) {
    const round=await tx.sportRound.create({data:{competitionId,number,name:`Rodada ${number}`}});roundIds.set(number,round.id);
  }
  for(const {homeKey,awayKey,round,...match} of programme.matches) await tx.sportMatch.create({data:{competitionId,homeId:teamIds.get(homeKey)!,awayId:teamIds.get(awayKey)!,roundId:roundIds.get(round)!,...match}});
}
