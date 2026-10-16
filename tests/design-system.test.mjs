import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const source=()=>readFileSync("src/app/page.tsx","utf8");
const system=()=>readFileSync("src/app/design-system.css","utf8");
test("shadcn Lyra neutral preset is the design reference",()=>{
  const css=system();const docs=readFileSync("DESIGN_SYSTEM.md","utf8");
  assert.match(docs,/buFywKm/);assert.match(docs,/Lyra/);assert.match(docs,/Inter/);
  assert.match(css,/--primary: #171717/);assert.match(css,/--radius: 0px/);
  assert.match(css,/--chart-5: #d4d4d4/);
});
test("theme is imported last, after existing layout styles",()=>{
  const app=source();
  assert.ok(app.indexOf('import "./dashboard.css"')<app.indexOf('import "./account.css"'));
  assert.ok(app.indexOf('import "./account.css"')<app.indexOf('import "./design-system.css"'));
});
test("dashboard momentum chart uses real habit-completion values",()=>{
  const app=source();
  assert.match(app,/conic-gradient\(var\(--chart-1\)/);
  assert.match(app,/done\/scheduled.length\*100/);
  assert.doesNotMatch(app,/className="orbit-star"/);
});
test("habit and account flows preserved through styling change",()=>{
  const app=source();
  for(const part of ['record(h)','timer(h,','<AccountSettings','getAvatar','recoverPassword','saveHabit','setSleepForm','setView("insights")'])assert.ok(app.includes(part),part);
});
test("focus, mobile layout, contrast and chart styling provided",()=>{
  const css=system();
  assert.match(css,/:focus-visible/);assert.match(css,/@media \(max-width: 750px\)/);
  assert.match(css,/\.bar\.hit/);assert.match(css,/\.modal/);
});
