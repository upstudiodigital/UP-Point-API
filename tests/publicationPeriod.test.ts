import {test} from "node:test";
import assert from "node:assert/strict";
import {calendarMonths,publicationPeriod,scToday} from "../src/portal/publicationPeriod";
import {parseProgramme} from "../src/portal/championshipSetup";
test("monthly championship coverage includes full initiated calendar months and clamps month-end",()=> {
  assert.equal(calendarMonths("2026-01-01","2026-04-30"),4);
  assert.equal(calendarMonths("2026-01-01","2026-05-01"),5);
  assert.equal(calendarMonths("2026-01-31","2026-02-27"),1);
  assert.equal(calendarMonths("2026-01-31","2026-02-28"),2);
  assert.equal(calendarMonths("2028-01-31","2028-02-28"),1);
  assert.equal(calendarMonths("2026-02-01","2026-02-01"),1);
  assert.throws(()=>calendarMonths("2026-02-30","2026-03-01"));
  assert.throws(()=>calendarMonths("2026-04-01","2026-03-31"));
  assert.equal(scToday(new Date("2026-10-14T02:59:00Z")),"2026-10-13");
  assert.equal(scToday(new Date("2026-10-14T03:00:00Z")),"2026-10-14");
  const quote=publicationPeriod({advertisingFrom:"2026-11-01",advertisingUntil:"2027-02-28",amountCents:1},"2027-02-28","2026-10-13");
  assert.equal(quote.billedMonths*quote.monthlyRateCents,20000);
  assert.throws(()=>publicationPeriod({advertisingUntil:"2027-03-01"},"2027-02-28","2026-10-13"));
});
test("initial championship programme validates participants, fixtures, dates, referees and rosters before billing",()=> {
  const valid={teams:[{key:"a",name:"Equipe A",roster:"1 | Goleiro | GK"},{key:"b",name:"Equipe B"}],matches:[{homeKey:"a",awayKey:"b",round:1,date:"2026-11-20",time:"15:00",venue:"Campo teste",city:"Florianópolis",address:"Rua teste 123",officials:"Árbitro principal | Árbitro Demo",officialsConfirmed:true}]};
  const p=parseProgramme(JSON.stringify(valid),"2026-11-01","2026-11-30");
  assert.equal(p.teams[0].players.length,1);assert.equal(p.matches[0].officials[0].name,"Árbitro Demo");
  assert.throws(()=>parseProgramme({...valid,matches:[{...valid.matches[0],awayKey:"a"}]},"2026-11-01","2026-11-30"));
  assert.throws(()=>parseProgramme({...valid,matches:[{...valid.matches[0],date:"2027-11-20"}]},"2026-11-01","2026-11-30"));
  assert.throws(()=>parseProgramme({...valid,matches:[]},"2026-11-01","2026-11-30"));
});
