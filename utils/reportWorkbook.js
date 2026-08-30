const ExcelJS = require("exceljs");

const NAVY = "07111F";
const PANEL = "102038";
const CYAN = "35D8FF";
const GREEN = "43E6A0";
const ORANGE = "FF934E";
const PURPLE = "AA7CFF";
const WHITE = "F1F7FF";
const MUTED = "9FB4C8";

function safe(value) { return value == null ? "" : String(value); }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function score(team, key) { return num(team?.progress?.[key]?.score); }
function durationSeconds(ms) { const n = Number(ms); return Number.isFinite(n) ? Math.round(n / 1000) : ""; }

function addTitle(sheet, title, subtitle, endCol) {
  sheet.mergeCells(1, 1, 1, endCol);
  sheet.getCell(1, 1).value = title;
  sheet.mergeCells(2, 1, 2, endCol);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 22;
  sheet.getRow(1).eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { color: { argb: WHITE }, bold: true, size: 18 };
    cell.alignment = { vertical: "middle" };
  });
  sheet.getRow(2).eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PANEL } };
    cell.font = { color: { argb: CYAN }, bold: true, size: 10 };
  });
}

function addKpis(sheet, items) {
  let col = 1;
  for (const [label, value, color = CYAN] of items) {
    const a = sheet.getCell(4, col), b = sheet.getCell(4, col + 1);
    a.value = label; b.value = value;
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PANEL } };
    b.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    a.font = { color: { argb: MUTED }, bold: true, size: 9 };
    b.font = { color: { argb: NAVY }, bold: true, size: 12 };
    a.alignment = b.alignment = { horizontal: "center", vertical: "middle" };
    col += 3;
  }
  sheet.getRow(4).height = 27;
}

function styleHeader(row) {
  row.height = 25;
  row.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "17324D" } };
    cell.font = { color: { argb: WHITE }, bold: true, size: 9 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "315777" } } };
  });
}

function styleRows(sheet, startRow, endRow, rankColumn = 0) {
  for (let r = startRow; r <= endRow; r += 1) {
    const row = sheet.getRow(r); row.height = 22;
    row.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r % 2 === 0 ? "F7FAFC" : "EAF2F8" } };
      cell.font = { color: { argb: "102038" }, size: 9 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "CBD5E1" } } };
    });
    if (rankColumn) {
      const rank = Number(row.getCell(rankColumn).value || 0);
      const colors = { 1: "F4D65D", 2: "D9E2EA", 3: "E8B78A" };
      if (colors[rank]) {
        row.getCell(rankColumn).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors[rank] } };
        row.getCell(rankColumn).font = { bold: true, color: { argb: NAVY } };
      }
    }
  }
}

function setWidths(sheet, widths) { widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; }); }

function workbookMeta(workbook, event) {
  workbook.creator = "BYTEFEST 2026 Competition Control";
  workbook.company = "Invictus Tech Club";
  workbook.subject = `${event} official score report`;
  workbook.title = `BYTEFEST 2026 - ${event} Score Report`;
  workbook.created = new Date();
}

function progressRows(team, event) {
  const out = [];
  for (const [roundKey, round] of Object.entries(team?.progress || {})) {
    for (const [stageKey, stage] of Object.entries(round?.stages || {})) {
      out.push([
        team.registrationId || team.teamId, team.teamName, event, roundKey, stageKey,
        num(stage?.score), num(stage?.attempts), Array.isArray(stage?.hintsUsed) ? stage.hintsUsed.length : 0,
        durationSeconds(stage?.completionMs), stage?.startedAt || "", stage?.completedAt || ""
      ]);
    }
  }
  return out;
}

async function standardWorkbook({ event, registrations, teams }) {
  const wb = new ExcelJS.Workbook(); workbookMeta(wb, event);
  const stateMap = new Map(teams.map(t => [safe(t.registrationId || t.teamId).toUpperCase(), t]));
  const rows = registrations.map(reg => {
    const team = stateMap.get(safe(reg.registrationId).toUpperCase()) || {};
    const qualification = event === "Bug Hunt"
      ? score(team,"round1") + score(team,"round2") + score(team,"round3") + score(team,"surprise")
      : num(team.totalScore);
    return {
      registrationId: reg.registrationId || team.registrationId || team.teamId,
      teamName: reg.teamName || team.teamName || "",
      members: [reg?.participant?.name, ...(reg?.members || []).map(x => x?.name)].filter(Boolean).join(", ") || (team.members || []).join(", "),
      email: reg?.participant?.email || "", phone: reg?.participant?.phone || "",
      status: team.currentRound || "NOT LOGGED IN", stage: team.currentStage || "",
      r1: score(team,"round1"), r2: score(team,"round2"), r3: score(team,"round3"), surprise: score(team,"surprise"), qualifier: score(team,"qualifier"),
      total: event === "Code Sprint" ? num(team.totalScore) : qualification,
      final: score(team,"final"), hints: num(team.totalHintsUsed), wrong: num(team.wrongSubmissions),
      violations: num(team?.security?.violations), dq: Boolean(team?.security?.disqualified),
      rank: team.rank || "", finalPlace: team.finalPlace || team?.knockout?.finalPlace || ""
    };
  });
  rows.sort((a,b)=>Number(a.finalPlace||999)-Number(b.finalPlace||999)||Number(a.rank||999)-Number(b.rank||999)||Number(b.total||0)-Number(a.total||0));
  const maxScore = Math.max(0,...rows.map(r=>Number(r.total||0)));
  const top = rows.find(r=>Number(r.finalPlace)===1) || rows[0];

  const summary = wb.addWorksheet("Summary",{views:[{showGridLines:false}]});
  addTitle(summary,`BYTEFEST 2026 - ${event.toUpperCase()} OFFICIAL REPORT`,`Generated ${new Date().toLocaleString("en-IN")} · Teacher/Judge copy`,12);
  addKpis(summary,[["Teams",rows.length,CYAN],["Completed",rows.filter(r=>r.status==="completed").length,GREEN],["Top Score",maxScore,ORANGE],["Hints Used",rows.reduce((s,r)=>s+r.hints,0),PURPLE]]);
  summary.getCell("A6").value="Winner / Leader"; summary.getCell("C6").value=top ? (top.teamName || top.registrationId) : "-"; summary.mergeCells("C6:H6");
  summary.getCell("A7").value="Registration ID"; summary.getCell("C7").value=top?.registrationId || "-"; summary.mergeCells("C7:H7");
  summary.getCell("A8").value="Purpose"; summary.getCell("C8").value="Official score verification, teacher review and result record."; summary.mergeCells("C8:H8");
  ["A6","A7","A8"].forEach(ref=>summary.getCell(ref).font={bold:true,color:{argb:CYAN}});
  setWidths(summary,[22,3,18,18,18,18,18,18,18,18,18,18]);

  const ranking = wb.addWorksheet("Ranking",{views:[{showGridLines:false}]});
  const headers=["Rank","Final Place","Registration ID","Team Name","Members","Lead Email","Lead Phone","Status","Stage","Round 1","Round 2",...(event==="Bug Hunt"?["Round 3","Surprise"]:["Qualifier"]),"Total / Qualification","Final","Hints","Wrong Attempts","Security Violations","DQ"];
  addTitle(ranking,`BYTEFEST 2026 - ${event.toUpperCase()} RANKING`,`Scores are read directly from the competition database.`,headers.length);
  addKpis(ranking,[["Teams",rows.length,CYAN],["Top Score",maxScore,GREEN],["Completed",rows.filter(r=>r.status==="completed").length,ORANGE]]);
  ranking.getRow(5).values=headers; styleHeader(ranking.getRow(5));
  rows.forEach(r=>{
    const v=[r.rank,r.finalPlace,r.registrationId,r.teamName,r.members,r.email,r.phone,r.status,r.stage,r.r1,r.r2];
    if(event==="Bug Hunt")v.push(r.r3,r.surprise); else v.push(r.qualifier);
    v.push(r.total,r.final,r.hints,event==="Bug Hunt"?r.wrong:"",r.violations,r.dq?"YES":"NO"); ranking.addRow(v);
  });
  styleRows(ranking,6,5+rows.length,1);
  setWidths(ranking,[8,11,18,24,44,28,16,20,8,10,10,10,10,16,10,8,13,15,8]);
  ranking.autoFilter={from:{row:5,column:1},to:{row:5,column:headers.length}};
  ranking.views=[{state:"frozen",ySplit:5,xSplit:4,showGridLines:false}];

  const details=wb.addWorksheet("Stage Details",{views:[{showGridLines:false}]});
  const dHeaders=["Registration ID","Team Name","Event","Round","Stage","Score","Attempts","Hints Used","Completion Seconds","Started At","Completed At"];
  const dRows=teams.flatMap(t=>progressRows(t,event));
  addTitle(details,`BYTEFEST 2026 - ${event.toUpperCase()} STAGE DETAILS`,`Per-stage audit trail for score verification.`,dHeaders.length);
  addKpis(details,[["Stage Records",dRows.length,CYAN],["Attempts",dRows.reduce((s,r)=>s+num(r[6]),0),ORANGE],["Hints",dRows.reduce((s,r)=>s+num(r[7]),0),PURPLE]]);
  details.getRow(5).values=dHeaders; styleHeader(details.getRow(5)); dRows.forEach(r=>details.addRow(r));
  styleRows(details,6,5+dRows.length); setWidths(details,[18,24,14,18,12,10,10,10,18,23,23]);
  details.autoFilter={from:{row:5,column:1},to:{row:5,column:dHeaders.length}}; details.views=[{state:"frozen",ySplit:5,xSplit:2,showGridLines:false}];
  return wb;
}

async function checkmateWorkbook({ players, matches }) {
  const wb=new ExcelJS.Workbook(); workbookMeta(wb,"Checkmate");
  const sorted=[...players].sort((a,b)=>Number(a.finalPlace||999)-Number(b.finalPlace||999)||Number(a.rank||999)-Number(b.rank||999)||num(b.tournamentPoints)-num(a.tournamentPoints));
  const summary=wb.addWorksheet("Summary",{views:[{showGridLines:false}]});
  addTitle(summary,"BYTEFEST 2026 - CHECKMATE OFFICIAL REPORT",`Generated ${new Date().toLocaleString("en-IN")} · Teacher/Judge copy`,12);
  addKpis(summary,[["Players",players.length,CYAN],["Matches",matches.length,ORANGE],["Completed",matches.filter(m=>m.status==="completed").length,GREEN],["Leader Pts",sorted[0]?.tournamentPoints||0,PURPLE]]);
  summary.getCell("A6").value="Winner / Leader";summary.getCell("C6").value=sorted[0]?.playerName||"-";summary.mergeCells("C6:H6");setWidths(summary,[22,3,18,18,18,18,18,18,18,18,18,18]);

  const ranking=wb.addWorksheet("Player Ranking",{views:[{showGridLines:false}]});
  const h=["Rank","Final Place","Registration ID","Player","Tournament Points","Wins","Draws","Losses","Capture Points","Material +/-","Total Moves"];
  addTitle(ranking,"BYTEFEST 2026 - CHECKMATE PLAYER RANKING","League points + capture/material/move records.",h.length);addKpis(ranking,[["Players",players.length,CYAN],["Matches",matches.length,ORANGE],["Top Points",sorted[0]?.tournamentPoints||0,GREEN]]);ranking.getRow(5).values=h;styleHeader(ranking.getRow(5));
  sorted.forEach(p=>ranking.addRow([p.rank,p.finalPlace,p.registrationId,p.playerName,num(p.tournamentPoints),num(p.wins),num(p.draws),num(p.losses),num(p.capturePoints),num(p.materialFor)-num(p.materialAgainst),num(p.totalMoves)]));styleRows(ranking,6,5+sorted.length,1);setWidths(ranking,[8,11,18,28,16,8,8,8,15,13,12]);ranking.autoFilter={from:{row:5,column:1},to:{row:5,column:h.length}};ranking.views=[{state:"frozen",ySplit:5,xSplit:4,showGridLines:false}];

  const ms=wb.addWorksheet("Match Results",{views:[{showGridLines:false}]});
  const mh=["Board","Phase","White","White ID","Black","Black ID","Status","Result","Reason","White Material","Black Material","White Moves","Black Moves","Full Moves"];
  addTitle(ms,"BYTEFEST 2026 - CHECKMATE MATCH RESULTS","Official match-by-match record.",mh.length);addKpis(ms,[["Matches",matches.length,CYAN],["Completed",matches.filter(m=>m.status==="completed").length,GREEN],["Running",matches.filter(m=>m.status==="running").length,ORANGE]]);ms.getRow(5).values=mh;styleHeader(ms.getRow(5));
  matches.forEach(m=>ms.addRow([m.boardNumber,m.phase,m.whiteName,m.whiteRegistrationId,m.blackName,m.blackRegistrationId,m.status,m.result,m.resultReason,m.whiteMaterial,m.blackMaterial,m.whiteMoves,m.blackMoves,m.fullMoves]));styleRows(ms,6,5+matches.length);setWidths(ms,[8,15,24,18,24,18,12,15,28,13,13,12,12,10]);ms.autoFilter={from:{row:5,column:1},to:{row:5,column:mh.length}};ms.views=[{state:"frozen",ySplit:5,xSplit:2,showGridLines:false}];
  return wb;
}

module.exports={standardWorkbook,checkmateWorkbook};
