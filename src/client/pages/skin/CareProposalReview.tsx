import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import type { CareProposal, CareTask } from '../../../shared/skin';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Props = {
  proposal: CareProposal;
  busy: boolean;
  onApply: () => void;
  onReject: () => void;
};

export function CareProposalReview({ proposal, busy, onApply, onReject }: Props) {
  const { skin, setPage } = useApp();
  const [day, setDay] = useState(() => new Date().getDay());
  const limit = skin.care.commitment;
  const activeProducts = skin.products.filter(product => product.status === 'active');
  const onDay = (task: CareTask, index: number) =>
    (task.days.length === 0 || task.days.includes(index)) && (task.time !== 'wash' || limit.washDays.includes(index));
  const scheduled = proposal.tasks.filter(task => onDay(task, day));
  const minutes = scheduled.reduce((sum, task) => sum + task.minutes, 0);
  const hasProductInAM = (category: 'cleanser' | 'serum') => proposal.tasks.some(task =>
    task.time === 'morning' && activeProducts.some(product =>
      product.id === task.productId && (category === 'cleanser' ? product.category === 'cleanser' : /niacinamide/i.test(product.name + ' ' + product.actives.join(' ')))));
  const ownsCleanser = activeProducts.some(product => product.category === 'cleanser');
  const ownsNiacinamide = activeProducts.some(product => /niacinamide/i.test(product.name + ' ' + product.actives.join(' ')));
  const ownsMoisturizer = activeProducts.some(product => product.category === 'moisturizer');
  const plansExfoliation = proposal.tasks.some(task => activeProducts.some(product => product.id === task.productId && /exfoliat|\baha\b|\bbha\b/i.test(product.name)));
  const hiddenAction = proposal.tasks.some(task => /(?:not|isn't|is not|doesn't|does not)\s+counted|(?:doesn't|does not)\s+count/i.test(task.notes));
  const notices = [
    ownsCleanser && !hasProductInAM('cleanser') ? 'Morning cleansing is not in this draft. If you want to cleanse in the morning, ask Coach to add it.' : '',
    ownsNiacinamide && !hasProductInAM('serum') ? 'Your niacinamide serum is not in the AM sequence. Ask Coach to move it if morning use is your preference.' : '',
    skin.profile.skinType === 'dry' && plansExfoliation && !ownsMoisturizer ? 'You marked your skin as dry, and this draft includes an exfoliant, but no moisturizer is on your shelf. Discuss dryness and product directions with Coach before applying.' : '',
    hiddenAction ? 'A step says an extra action is “not counted.” This conflicts with your daily limit. Ask Coach to revise and count every action.' : '',
  ].filter(Boolean);

  function slot(title: string, time: 'morning' | 'evening' | 'other', icon: string) {
    const tasks = scheduled.filter(task => time === 'other' ? task.time === 'anytime' || task.time === 'wash' : task.time === time);
    if (time === 'other' && !tasks.length) return null;
    return <section className={'care-proposal-slot ' + time} key={time}>
      <div className="care-proposal-slot-head"><span className="care-routine-icon" aria-hidden="true">{icon}</span><div><span className="page-eyebrow">{days[day]} · {tasks.reduce((sum, task) => sum + task.minutes, 0)} min</span><h3>{title}</h3></div><span className="care-routine-count">{tasks.length} actions</span></div>
      <div className="care-proposal-slot-body">{tasks.length ? tasks.map((task, index) => {
        const product = activeProducts.find(item => item.id === task.productId);
        return <article className="care-proposal-step" key={task.id}><span className="care-step-index">{String(index + 1).padStart(2, '0')}</span><div><div className="care-step-head"><h4>{task.label}</h4><span className="care-step-time">{task.minutes} min</span></div>{product && <small title={product.name}>{product.brand} {product.name}</small>}{task.notes && <p className="care-proposal-note">{task.notes}</p>}</div></article>;
      }) : <p className="care-plan-empty">No {time === 'morning' ? 'AM' : 'PM'} action on {days[day]}.</p>}</div>
    </section>;
  }

  return <section className="care-proposal-review">
    <div className="care-proposal-intro"><span className="page-eyebrow">COACH DRAFT · NOTHING SAVED YET</span><h2>Check the actual day, then decide</h2><p>{proposal.reason}</p></div>
    <div className="care-proposal-week"><div><strong>Choose a day</strong><p>AM and PM together must fit {limit.maxSteps} actions and {limit.minutesPerDay} minutes.</p></div><div className="care-proposal-days">{days.map((name, index) => {
      const tasks = proposal.tasks.filter(task => onDay(task, index));
      return <button type="button" key={name} aria-pressed={day === index} className={'care-day-chip ' + (day === index ? 'selected' : '')} onClick={() => setDay(index)}><strong>{name}</strong><small>{tasks.length} actions · {tasks.reduce((sum, task) => sum + task.minutes, 0)} min</small></button>;
    })}</div></div>
    <div className="care-proposal-day-total"><strong>{days[day]}: {scheduled.length} actions · {minutes} minutes</strong><span>Across AM and PM</span></div>
    <div className="care-proposal-grid">{slot('AM routine', 'morning', '☀')}{slot('PM routine', 'evening', '☾')}{slot('Flexible & wash day', 'other', '✦')}</div>
    <div className="care-proposal-coverage"><strong>How often each product appears</strong><div>{activeProducts.map(product => {
      const productTasks = proposal.tasks.filter(task => task.productId === product.id);
      const count = days.filter((_, index) => productTasks.some(task => onDay(task, index))).length;
      return <p key={product.id}><span title={product.name}>{product.brand} {product.name}</span><b>{count}/7 days</b></p>;
    })}</div></div>
    {notices.length > 0 && <div className="care-proposal-notices" role="note"><strong>Check these before applying</strong>{notices.map(notice => <p key={notice}>{notice}</p>)}</div>}
    <div className="care-proposal-footer"><p>Only the actions shown for a selected day happen that day. Review the whole week before applying.</p><div className="row"><button type="button" className="btn btn-soft" onClick={() => setPage('SkinGoals')}>Edit commitment</button><button type="button" className="btn btn-soft" onClick={onReject}>Reject draft</button><button type="button" disabled={busy || hiddenAction} className="btn btn-hot" onClick={onApply}>Apply reviewed plan</button></div></div>
  </section>;
}
