import { useMemo, useState } from 'react';
import { plateCalculator } from '../../shared/training';

export function PlateCalculator({
  units = 'kg',
  defaultTarget = '',
  barKg = 20,
  barLb = 45,
}: {
  units?: 'kg' | 'lb';
  defaultTarget?: string;
  barKg?: number;
  barLb?: number;
}) {
  const [target, setTarget] = useState(defaultTarget);
  const bar = units === 'kg' ? barKg : barLb;
  const result = useMemo(() => {
    const t = Number(target);
    if (!t) return null;
    return plateCalculator(t, units, bar);
  }, [target, units, bar]);

  return (
    <div className="glass card" style={{ padding: 12 }}>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>Plate calculator</b>
        <span className="subtle" style={{ fontSize: 11 }}>
          Bar {bar} {units}
        </span>
      </div>
      <input
        className="input"
        type="number"
        placeholder={`Target ${units}`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      {result ? (
        <div className="mt-2" style={{ fontSize: 13 }}>
          <div>
            Per side:{' '}
            <b>{result.perSide.length ? result.perSide.join(' + ') : '— empty'}</b>
          </div>
          <div className="subtle">
            Loads to {result.total} {units}
            {result.remainder ? ` (off by ${result.remainder})` : ''}
          </div>
        </div>
      ) : (
        <p className="subtle mt-2" style={{ marginBottom: 0, fontSize: 12 }}>
          Enter target load for plate math.
        </p>
      )}
    </div>
  );
}
