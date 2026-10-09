import PDFDocument from 'pdfkit';
import * as repo from '../db/repository.js';
import type { Session } from '../../shared/types.js';
import { computeMetrics } from './metrics.js';
import { REPORT_LOGO_DATA_URI } from '../../shared/report-logo.js';

function renderExerciseLogs(doc: PDFKit.PDFDocument, session: Session, margin: number, pageWidth: number, pageHeight: number, startY: number): number {
  const units = repo.getProfile().units || 'kg';
  let cursorY = startY;
  
  session.logs.forEach((log, i) => {
    if (log.status === 'skipped') return;
    
    // Exercise Title
    doc.fillColor('#202124').font('Helvetica-Bold').fontSize(12).text(`${i + 1}. ${log.name}`, margin + 15, cursorY);
    doc.fillColor('#686863').font('Helvetica').fontSize(10).text(log.target || 'Other', pageWidth - margin - 15 - 100, cursorY, { width: 100, align: 'right' });
    cursorY += 18;
    
    // Sets Header
    doc.fillColor('#a49f95').fontSize(9)
       .text('SET', margin + 25, cursorY)
       .text('WEIGHT', margin + 80, cursorY)
       .text('REPS', margin + 140, cursorY)
       .text('RPE', margin + 200, cursorY);
    cursorY += 15;
    
    // Sets rows
    log.sets.forEach(set => {
      doc.fillColor('#686863').fontSize(10)
         .text(`${set.s}`, margin + 25, cursorY)
         .text(`${set.w} ${units}`, margin + 80, cursorY)
         .text(`${set.r}`, margin + 140, cursorY)
         .text(set.rpe ? `${set.rpe}` : '-', margin + 200, cursorY);
      cursorY += 15;
      
      if (cursorY > pageHeight - 60) {
        doc.addPage({ margin: 0, size: 'A4' });
        cursorY = 50;
      }
    });
    
    if (log.journal) {
      cursorY += 5;
      doc.fillColor('#686863').font('Helvetica-Oblique').fontSize(9).text(`Note: ${log.journal}`, margin + 25, cursorY, { width: pageWidth - margin * 2 - 40 });
      // approximate height
      cursorY += 15;
    }

    if (log.aiCoachComment) {
      cursorY += 5;
      doc.roundedRect(margin + 25, cursorY, pageWidth - margin * 2 - 50, 40, 4).fill('#f3f0f8');
      doc.rect(margin + 25, cursorY, 3, 40).fill('#7456b8'); // left border
      doc.fillColor('#7456b8').font('Helvetica-Bold').fontSize(9).text('AI Coach:', margin + 35, cursorY + 8);
      doc.fillColor('#58437f').font('Helvetica').fontSize(9).text(log.aiCoachComment, margin + 35, cursorY + 20, { width: pageWidth - margin * 2 - 70 });
      cursorY += 55;
    }
    
    cursorY += 15;
    if (cursorY > pageHeight - 60) {
      doc.addPage({ margin: 0, size: 'A4' });
      cursorY = 50;
    }
  });
  
  return cursorY;
}

export async function generateDailyReportPDF(sessionId: string): Promise<Buffer> {
  const db = repo.loadAppDb();
  const session = db.sessions.find(s => s.id === sessionId);
  
  if (!session) throw new Error('Session not found');

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;
      
      // Header
      doc.rect(0, 0, pageWidth, 120).fill('#202124');
      doc.image(Buffer.from(REPORT_LOGO_DATA_URI.split(',')[1],'base64'),pageWidth-margin-56,30,{width:56});
      doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('Daily Session Report', margin, 40);
      doc.fillColor('#a49f95').fontSize(12).font('Helvetica').text(`${session.date} • ${session.dayTitle}`, margin, 75);
      
      let cursorY = 150;
      
      // Readiness Section
      doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('Readiness', margin, cursorY);
      cursorY += 25;
      
      const r = session.readiness;
      if (!r) {
        doc.fillColor('#686863').fontSize(12).font('Helvetica-Oblique').text('No detailed readiness data logged.', margin, cursorY);
        cursorY += 30;
      } else {
        const metrics = [
          { label: 'Score', value: `${r.score}/100` },
          { label: 'Sleep', value: `${r.sleepHours} hrs` },
          { label: 'Soreness', value: `${r.soreness}/10` },
          { label: 'Energy', value: `${r.energy}/10` },
          { label: 'Stress', value: `${r.stress}/10` },
          { label: 'Motivation', value: `${r.motivation}/10` },
          { label: 'Mood', value: `${r.mood}/10` },
          { label: 'Hydration', value: `${r.hydration} ${r.hydrationUnit || 'L'}` },
          { label: 'Protein', value: `${r.mealProtein} g` },
          { label: 'Pain Flag', value: r.painFlag ? 'Yes' : 'No' }
        ];

        const cols = 5;
        const boxWidth = (pageWidth - margin * 2 - (10 * (cols - 1))) / cols;
        const boxHeight = 45;
        
        let c = 0;
        let rIdx = 0;
        metrics.forEach((m) => {
          if (c >= cols) {
            c = 0;
            rIdx++;
          }
          const x = margin + c * (boxWidth + 10);
          const y = cursorY + rIdx * (boxHeight + 10);
          
          doc.roundedRect(x, y, boxWidth, boxHeight, 4).fill(m.label === 'Pain Flag' && r.painFlag ? '#fee2e2' : '#f6f5f2');
          doc.lineWidth(1).strokeColor(m.label === 'Pain Flag' && r.painFlag ? '#fca5a5' : '#e3e0d9').roundedRect(x, y, boxWidth, boxHeight, 4).stroke();
          
          doc.fillColor('#686863').fontSize(9).font('Helvetica').text(m.label, x, y + 10, { width: boxWidth, align: 'center' });
          doc.fillColor(m.label === 'Pain Flag' && r.painFlag ? '#ef4444' : '#202124').fontSize(12).font('Helvetica-Bold').text(m.value, x, y + 25, { width: boxWidth, align: 'center' });
          
          c++;
        });
        
        cursorY += (Math.ceil(metrics.length / cols) * (boxHeight + 10)) + 20;
      }
      
      // AI Summary Section if present
      if (session.aiOverallSummary) {
        doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 80, 8).fill('#f6f5f2');
        doc.rect(margin, cursorY, 6, 80).fill('#806b40');
        doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('AI Session Analysis', margin + 20, cursorY + 15);
        doc.fillColor('#686863').fontSize(11).font('Helvetica').text(session.aiOverallSummary, margin + 20, cursorY + 40, { width: pageWidth - margin * 2 - 40, lineGap: 4 });
        cursorY += 110;
        
        if (cursorY > pageHeight - 60) {
          doc.addPage({ margin: 0, size: 'A4' });
          cursorY = 50;
        }
      }

      // Exercise Logs
      doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('Exercise Logs', margin, cursorY);
      cursorY += 25;
      
      if (session.logs.length === 0) {
        doc.fillColor('#686863').fontSize(12).font('Helvetica-Oblique').text('No exercises logged.', margin, cursorY);
      } else {
        cursorY = renderExerciseLogs(doc, session, margin, pageWidth, pageHeight, cursorY);
      }
      
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function generateWeeklyReportPDF(weekId: string): Promise<Buffer> {
  const db = repo.loadAppDb();
  const week = db.weeks.find(w => w.id === weekId);
  const settings = repo.getSettings();
  
  if (!week) throw new Error('Week not found');

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;
      
      // Top Header Background
      doc.rect(0, 0, pageWidth, 120).fill('#202124');
      doc.image(Buffer.from(REPORT_LOGO_DATA_URI.split(',')[1],'base64'),pageWidth-margin-56,30,{width:56});

      // Header Text
      doc.fillColor('#ffffff').fontSize(32).font('Helvetica-Bold').text('Health OS', margin, 40);
      doc.fillColor('#a49f95').fontSize(14).font('Helvetica').text(`Weekly Performance Report`, margin, 80);
      doc.fillColor('#e3e0d9').fontSize(14).text(week.name, pageWidth - margin - 200, 80, { width: 200, align: 'right' });

      let cursorY = 140;

      if (week.missionObjective) {
        doc.fillColor('#c65d21').fontSize(12).font('Helvetica-Bold').text('MISSION OBJECTIVE', margin, cursorY);
        doc.fillColor('#ffffff').fontSize(14).font('Helvetica').text(week.missionObjective, margin, cursorY + 15);
        cursorY += 50;
      } else {
        cursorY += 20;
      }

      // AI Summary Section
      doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 80, 8).fill('#f6f5f2');
      doc.rect(margin, cursorY, 6, 80).fill('#806b40');

      doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('AI Coach Insights', margin + 20, cursorY + 15);
         
      let aiSummary = "Great job this week! Keep pushing your limits.";
      if (settings.aiProvider && settings.aiModel) {
          const sessions = db.sessions.filter(s => s.weekId === week.id && (s.status === 'finished' || s.status === 'completed'));
          aiSummary = `You've crushed ${sessions.length} sessions this week. Consistency is key, and you're building solid momentum. Keep it up!`;
      }
      
      doc.fillColor('#686863').fontSize(12).font('Helvetica').text(aiSummary, margin + 20, cursorY + 40, { width: pageWidth - margin * 2 - 40, lineGap: 4 });

      cursorY += 120;

      // Workout Logs Section
      doc.fillColor('#202124').fontSize(18).font('Helvetica-Bold').text('Weekly Logs', margin, cursorY);
      cursorY += 30;

      const sessions = db.sessions.filter(s => s.weekId === week.id);
      const finishedSessions = sessions.filter(s => s.status === 'finished' || s.status === 'completed');
      
      if (finishedSessions.length === 0) {
         doc.fontSize(12).fillColor('#686863').font('Helvetica-Oblique').text('No sessions logged this week.', margin, cursorY);
         cursorY += 30;
      } else {
         finishedSessions.forEach(s => {
           const vol = s.logs.reduce((acc, l) => acc + l.sets.reduce((sAcc, set) => sAcc + (Number(set.r) * Number(set.w)), 0), 0);
           
           // Session Header Card
           doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 50, 6).fill('#eeece7');
           doc.fillColor('#202124').font('Helvetica-Bold').fontSize(14).text(`${s.dayKey} • ${s.dayTitle}`, margin + 15, cursorY + 18);
           doc.fillColor('#806b40').font('Helvetica-Bold').fontSize(12).text(`${vol} kg Vol`, pageWidth - margin - 100, cursorY + 18, { width: 85, align: 'right' });
           
           cursorY += 65;
           
           if (cursorY > pageHeight - 100) {
              doc.addPage({ margin: 0, size: 'A4' });
              cursorY = 50;
           }
           
           // Render detailed exercises for this session
           cursorY = renderExerciseLogs(doc, s, margin, pageWidth, pageHeight, cursorY);
           
           cursorY += 20;
         });
      }

      // Body Measurements Section
      doc.fillColor('#202124').fontSize(18).font('Helvetica-Bold').text('Body Measurements', margin, cursorY);
      cursorY += 30;

      const lastMeasurement = [...db.measurements].sort((a,b) => b.date.localeCompare(a.date))[0];
      
      if (lastMeasurement) {
         const gridCols = 3;
         const boxWidth = (pageWidth - margin * 2 - (20 * (gridCols - 1))) / gridCols;
         const boxHeight = 70;
         
         const metrics = [
            { label: 'Weight', value: `${lastMeasurement.weight || '-'}`, unit: repo.getProfile().units || 'kg' },
            { label: 'Body Fat', value: `${lastMeasurement.bodyFat || '-'}`, unit: '%' },
            { label: 'Waist', value: `${lastMeasurement.waist || '-'}`, unit: 'cm/in' },
            { label: 'Neck', value: `${lastMeasurement.neck || '-'}`, unit: 'cm/in' },
            { label: 'Chest', value: `${lastMeasurement.chest || '-'}`, unit: 'cm/in' },
            { label: 'Arms', value: `${lastMeasurement.arms || '-'}`, unit: 'cm/in' },
            { label: 'Muscle Mass', value: `${lastMeasurement.muscleMass || '-'}`, unit: repo.getProfile().units || 'kg' },
            { label: 'BMR', value: `${lastMeasurement.bmr || '-'}`, unit: 'kcal' }
         ];

         let col = 0;
         metrics.forEach((m) => {
            if (col >= gridCols) {
               col = 0;
               cursorY += boxHeight + 20;
               if (cursorY > pageHeight - 150) {
                  doc.addPage({ margin: 0, size: 'A4' });
                  cursorY = 50;
               }
            }
            const x = margin + (col * (boxWidth + 20));
            doc.roundedRect(x, cursorY, boxWidth, boxHeight, 8).fill('#f6f5f2');
            doc.lineWidth(1).strokeColor('#e3e0d9').roundedRect(x, cursorY, boxWidth, boxHeight, 8).stroke();
            doc.fillColor('#686863').font('Helvetica').fontSize(11).text(m.label, x, cursorY + 15, { width: boxWidth, align: 'center' });
            doc.fillColor('#202124').font('Helvetica-Bold').fontSize(20).text(m.value, x, cursorY + 35, { width: boxWidth, align: 'center' });
            doc.fillColor('#a49f95').font('Helvetica').fontSize(10).text(m.unit, x, cursorY + 55, { width: boxWidth, align: 'center' });
            
            col++;
         });
         cursorY += boxHeight + 40;
      } else {
         doc.fontSize(12).fillColor('#686863').font('Helvetica-Oblique').text('No measurements logged.', margin, cursorY);
         cursorY += 40;
      }

      // Footer
      if (cursorY > pageHeight - 100) {
          doc.addPage({ margin: 0, size: 'A4' });
          cursorY = pageHeight - 100;
      } else {
          cursorY = pageHeight - 80;
      }
      
      doc.rect(0, cursorY, pageWidth, 100).fill('#eeece7');
      doc.fillColor('#a49f95')
         .fontSize(10)
         .font('Helvetica')
         .text(`Generated by Health OS on ${new Date().toLocaleDateString()}`, 0, cursorY + 40, { align: 'center', width: pageWidth });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Progress report over an optional date range (YYYY-MM-DD inclusive). */
export async function generateProgressReportPDF(fromDate?: string, toDate?: string): Promise<Buffer> {
  const db = repo.loadAppDb();
  const settings = repo.getSettings();
  const profile = repo.getProfile();
  const units = profile.units || 'kg';
  const metrics = computeMetrics(db, settings);

  const from = fromDate || '';
  const to = toDate || '';
  const sessions = db.sessions.filter((s) => {
    if (s.status !== 'finished' && s.status !== 'completed') return false;
    if (from && (s.date || '') < from) return false;
    if (to && (s.date || '') > to) return false;
    return true;
  });

  let rangeTonnage = 0;
  for (const s of sessions) {
    for (const log of s.logs || []) {
      if (log.status === 'skipped') continue;
      rangeTonnage += (log.sets || []).reduce(
        (sum, set) => sum + (Number(set.w) || 0) * (Number(set.r) || 0),
        0,
      );
    }
  }

  const rangeLabel =
    from || to ? `${from || '…'} → ${to || '…'}` : 'All time';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;

      doc.rect(0, 0, pageWidth, 120).fill('#202124');
      doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('Progress Report', margin, 40);
      doc.fillColor('#a49f95').fontSize(12).font('Helvetica').text(rangeLabel, margin, 80);

      let cursorY = 150;

      const stats = [
        { label: 'Sessions', value: String(sessions.length) },
        { label: 'Tonnage', value: `${Math.round(rangeTonnage)} ${units}` },
        { label: 'Lifetime', value: String(metrics.totals.streak) },
        { label: 'Lifetime PRs', value: String(metrics.recentPrs.length) },
      ];
      const boxW = (pageWidth - margin * 2 - 30) / 4;
      stats.forEach((st, i) => {
        const x = margin + i * (boxW + 10);
        doc.roundedRect(x, cursorY, boxW, 56, 6).fill('#f6f5f2');
        doc.fillColor('#686863').fontSize(9).font('Helvetica').text(st.label, x, cursorY + 12, {
          width: boxW,
          align: 'center',
        });
        doc.fillColor('#202124').fontSize(14).font('Helvetica-Bold').text(st.value, x, cursorY + 30, {
          width: boxW,
          align: 'center',
        });
      });
      cursorY += 80;

      doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('Top Personal Records', margin, cursorY);
      cursorY += 24;
      const prs = metrics.personalRecords.slice(0, 10);
      if (!prs.length) {
        doc.fillColor('#686863').font('Helvetica-Oblique').fontSize(11).text('No PRs yet.', margin, cursorY);
        cursorY += 24;
      } else {
        for (const pr of prs) {
          doc.fillColor('#202124').font('Helvetica-Bold').fontSize(11).text(pr.exercise, margin, cursorY);
          doc.fillColor('#686863')
            .font('Helvetica')
            .fontSize(10)
            .text(
              `${pr.bestWeight} ${units} × ${pr.bestReps} · e1RM ${Math.round(pr.bestE1rm)} · ${pr.date}`,
              margin + 160,
              cursorY,
              { width: pageWidth - margin * 2 - 160 },
            );
          cursorY += 18;
          if (cursorY > pageHeight - 80) {
            doc.addPage({ margin: 0, size: 'A4' });
            cursorY = 50;
          }
        }
      }

      cursorY += 16;
      doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('Goals', margin, cursorY);
      cursorY += 24;
      if (!metrics.goalProgress.length) {
        doc.fillColor('#686863').font('Helvetica-Oblique').fontSize(11).text('No goals set.', margin, cursorY);
        cursorY += 24;
      } else {
        for (const g of metrics.goalProgress) {
          doc.fillColor('#202124').font('Helvetica-Bold').fontSize(11).text(g.name, margin, cursorY);
          doc.fillColor('#686863')
            .font('Helvetica')
            .fontSize(10)
            .text(
              `${g.current} → ${g.target} ${g.unit} (${g.percent}%) · ${g.status}`,
              margin + 160,
              cursorY,
              { width: pageWidth - margin * 2 - 160 },
            );
          cursorY += 18;
        }
      }

      cursorY += 16;
      doc.fillColor('#202124').fontSize(16).font('Helvetica-Bold').text('Body deltas', margin, cursorY);
      cursorY += 24;
      const bd = metrics.bodyDeltas;
      const lines = [
        bd.weight
          ? `Weight: ${bd.weight.latest}${units}${bd.weight.previous != null ? ` (prev ${bd.weight.previous})` : ''}${bd.weight.delta30d != null ? ` · 30d ${bd.weight.delta30d > 0 ? '+' : ''}${bd.weight.delta30d}` : ''}`
          : null,
        bd.bodyFat
          ? `Body fat: ${bd.bodyFat.latest}%${bd.bodyFat.previous != null ? ` (prev ${bd.bodyFat.previous}%)` : ''}`
          : null,
        bd.waist
          ? `Waist: ${bd.waist.latest}${bd.waist.previous != null ? ` (prev ${bd.waist.previous})` : ''}`
          : null,
      ].filter(Boolean) as string[];
      if (!lines.length) {
        doc.fillColor('#686863').font('Helvetica-Oblique').fontSize(11).text('No measurements yet.', margin, cursorY);
      } else {
        for (const line of lines) {
          doc.fillColor('#686863').font('Helvetica').fontSize(11).text(line, margin, cursorY);
          cursorY += 16;
        }
      }

      cursorY = Math.max(cursorY + 40, pageHeight - 80);
      doc.rect(0, cursorY, pageWidth, 100).fill('#eeece7');
      doc
        .fillColor('#a49f95')
        .fontSize(10)
        .font('Helvetica')
        .text(`Generated by Health OS on ${new Date().toLocaleDateString()}`, 0, cursorY + 40, {
          align: 'center',
          width: pageWidth,
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
