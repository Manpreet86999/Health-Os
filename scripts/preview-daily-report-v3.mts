import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Revise the isolated V2 artifact. No production templates or delivery code are changed.
const output = path.resolve('outputs/daily-report-preview-v3');
await fs.mkdir(output, { recursive: true });
const input = await fs.readFile('outputs/daily-report-preview-v2/index.html', 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(input, { waitUntil: 'load' });
  await page.evaluate('window.__name = (fn) => fn');
  await page.evaluate(() => {
    const content = document.querySelector<HTMLTableCellElement>('td[style="padding:30px 16px 0"]')!;
    const blocks = [...content.children];
    const tableBlocks = blocks.filter(el => el.tagName === 'TABLE');
    const findTable = (text: string) => {
      const found = tableBlocks.find(el => el.textContent?.includes(text));
      if (!found) throw new Error('Missing original report block: ' + text);
      return found;
    };
    const findSection = (title: string) => {
      const section = [...content.querySelectorAll('section.v2-card')].find(el => el.querySelector('h2')?.textContent?.trim() === title);
      if (!section) throw new Error('Missing V2 section: ' + title);
      return section;
    };
    const readiness = findTable('Overall score');
    // Daily protein and water belong in intake. Steps appear once, here at the top.
    for (const key of ['hydration', 'mealProtein']) {
      readiness.querySelector(`[data-indicator="${key}"]`)?.closest('td.indicator-column')?.remove();
    }
    const indicatorCells = [...readiness.querySelectorAll('td.indicator-column')];
    const indicatorTable = readiness.querySelector('tr.indicator-row')?.closest('table');
    if (indicatorTable) {
      const tbody = document.createElement('tbody');
      for (let index = 0; index < indicatorCells.length; index += 4) {
        const tr = document.createElement('tr');
        tr.className = 'indicator-row';
        indicatorCells.slice(index,index+4).forEach(cell => tr.append(cell));
        tbody.append(tr);
      }
      indicatorTable.replaceChildren(tbody);
    }
    readiness.querySelectorAll('p').forEach(p => {
      if (p.textContent?.includes('Daily nutrition and activity totals')) p.remove();
    });
    const nutrition = findSection('Full-day intake');
    // No vitamin/mineral indicator boxes in this revision.
    nutrition.querySelectorAll('.v2-tile').forEach(tile => {
      if (tile.querySelector('.v2-label')?.textContent === 'Sodium') tile.remove();
    });
    const movement = findSection('Daily movement & add-ons');
    movement.querySelectorAll('.v2-tile').forEach(tile => {
      if (tile.querySelector('.v2-label')?.textContent === 'Steps') tile.remove();
    });
    movement.querySelector('.v2-grid')?.classList.add('v3-three');
    const statistics = findTable('Skipped');
    const details = findTable('Session details');
    const statsHeading = document.createElement('h2');
    statsHeading.className = 'v3-section-heading';
    statsHeading.textContent = 'Workout statistics & session details';
    const analysis = document.createElement('section');
    analysis.className = 'v2-card v3-analysis';
    const analysisIcon = findSection('One connected daily review').querySelector('h2 img')!.outerHTML;
    analysis.innerHTML = `<h2 class="v2-heading">${analysisIcon}<span>AI Session Analysis</span></h2><div class="v2-analysis"><p>Completed all six exercises with 19 logged sets in 54 minutes. The last deadlift set was 37.5 kg × 10 at RPE 8, with 2 reps in reserve.</p><p>Use the recorded sets and exercise notes as your baseline for the next comparable session. Review readiness before progressing; today’s daily food and recovery records inform the recommendations below.</p></div>`;
    const exercises = tableBlocks.filter(el => el.querySelector('h3'));
    if (exercises.length !== 6) throw new Error('Expected all six original exercise cards');
    const coach = findSection('Recommendations with context');
    const recos = [...coach.querySelectorAll('.v2-recommendation')];
    recos[0].querySelector('small')!.textContent = 'Based on: completed workout + daily protein and energy compared with saved goals.';
    recos[1].querySelector('small')!.textContent = 'Based on: readiness, sleep, soreness and the completed lower-body session.';
    recos[2].remove();
    recos[3].querySelector('.v2-number')!.textContent = '03';
    recos[3].querySelector('h3')!.textContent = 'Balance movement, hydration and rest';
    recos[3].querySelector('p')!.textContent = 'Plan comfortable movement and regular hydration around your saved goals and recovery. Review tomorrow’s check-in before adding activity to the training plan.';
    recos[3].querySelector('small')!.textContent = 'Based on: steps, walking, mobility, water intake and readiness. Overlapping activity totals are not added twice.';
    content.replaceChildren(readiness, nutrition, movement, statsHeading, statistics, details, analysis, ...exercises, coach);
    // Add context inside the existing brand header, with no hero or extra header box.
    const brandCell = document.querySelector<HTMLTableCellElement>('td[style*="padding:16px 36px"]')!;
    const metadata = document.createElement('div');
    metadata.className = 'v3-metadata';
    metadata.innerHTML = '<strong>Week 1 · Legs B · Friday, 16 October 2026</strong><span>Daily report · records through 11:00 pm IST</span>';
    brandCell.append(metadata);
    const footer = [...document.querySelectorAll('p')].find(p => p.textContent?.includes('Built from your saved records'))!;
    footer.insertAdjacentHTML('afterend','<p style="font-size:10px;color:#89877f;margin:8px 0 0">Design preview · illustrative data · awaiting approval</p>');
    const style = document.createElement('style');
    style.textContent = '.v3-metadata{margin-top:15px;font-size:12px;color:#202124;line-height:1.7}.v3-metadata strong,.v3-metadata span{display:block}.v3-metadata span{font-size:10px;color:#686863}.v3-section-heading{font-size:23px;line-height:1.3;letter-spacing:-.6px;margin:27px 0 18px}.v3-three{grid-template-columns:repeat(3,minmax(0,1fr))}.v3-analysis .v2-heading{margin-bottom:18px}@media(max-width:480px){.v3-three{grid-template-columns:repeat(2,minmax(0,1fr))}.v3-section-heading{font-size:21px}}';
    document.head.append(style);
    document.title = 'Health OS · Daily report · Revised order';
  });
  const html = await page.content();
  await fs.writeFile(path.join(output,'index.html'),html);
  const checks = [];
  for (const width of [900,390,320]) {
    await page.setViewportSize({width,height:1100});
    await page.setContent(html,{waitUntil:'load'});
    const check = await page.evaluate(() => {
      const content = document.querySelector('td[style="padding:30px 16px 0"]')!;
      const indicators = [...document.querySelectorAll('[data-indicator]')].map(el=>el.getAttribute('data-indicator'));
      const tileLabels = [...document.querySelectorAll('.v2-label')].map(el=>el.textContent);
      const removed = ['Your day.','One connected daily review','Micronutrient indicators','Health & daily habits','Saved now. Reviewed at 11 pm.','Your body, in perspective'];
      return {viewport:innerWidth,width:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,headings:[...content.querySelectorAll('h2,h3')].filter(el=>!el.closest('.v2-recommendation')).map(el=>el.textContent?.trim()),indicators,tileLabels,removedSectionsAbsent:removed.every(text=>!document.body.textContent?.includes(text)),stepsCount:indicators.filter(key=>key==='steps').length,proteinCount:document.querySelectorAll('.v2-nutrient strong').length && [...document.querySelectorAll('.v2-nutrient strong')].filter(el=>el.textContent==='Protein').length};
    });
    if(check.width>width||check.brokenImages||!check.removedSectionsAbsent||check.stepsCount!==1||check.proteinCount!==1||check.indicators.includes('hydration')||check.indicators.includes('mealProtein')||check.tileLabels.includes('Sodium')) throw new Error(JSON.stringify(check));
    const expected=['Readiness','Full-day intake','Daily movement & add-ons','Workout statistics & session details','AI Session Analysis','1. Conventional Deadlift','2. Goblet Squat','3. Walking Dumbbell Lunge','4. Barbell Hip Thrust','5. Standing Calf Raise','6. Hanging Knee Raise','Recommendations with context'];
    if(JSON.stringify(check.headings)!==JSON.stringify(expected)) throw new Error('Wrong section order: '+JSON.stringify(check.headings));
    checks.push(check);
    await page.screenshot({path:path.join(output,`report-${width}.png`),fullPage:true});
    if(width===900) await page.screenshot({path:path.join(output,'overview.png')});
  }
  await fs.writeFile(path.join(output,'checks.json'),JSON.stringify(checks,null,2));
  console.log(JSON.stringify({output,checks},null,2));
} finally { await browser.close(); }

