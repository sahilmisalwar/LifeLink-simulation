// ============================================================
// LIFElink — Workers: All Worker Instances in the Mine
// ============================================================

import { WORKERS } from '../utils/constants';
import Worker from './Worker';

export default function Workers() {
  return (
    <group>
      {WORKERS.map((worker) => (
        <Worker key={worker.id} config={worker} />
      ))}
    </group>
  );
}
