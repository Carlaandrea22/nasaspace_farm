import { Check } from 'lucide-react';

export type ConsultationPhase = 'editing' | 'pending' | 'complete';
export type ConsultationMode = 'water' | 'rotations';

const steps = ['Ubica tu parcela', 'Elige tu consulta', 'Completa tu cultivo', 'Consulta el resultado'];

export function ConsultationProgress({ selected, phase }: { selected: boolean; phase: ConsultationPhase }) {
  const completed = !selected ? 1 : phase === 'editing' ? 2 : phase === 'pending' ? 3 : 4;
  const guidance = !selected ? 'Elige qué quieres consultar sobre tu terreno.'
    : phase === 'editing' ? 'Completa los datos de tu cultivo y pulsa el botón para calcular.'
    : phase === 'pending' ? 'El resultado todavía no está disponible. Revisa los avisos de la consulta.'
    : 'Consulta lista. Ya puedes revisar el resultado o cambiar tus datos.';

  return <div className="consultation-progress">
    <ol aria-label="Pasos de la consulta" className="consultation-path">
      {steps.map((label, index) => {
        const done = index < completed;
        const current = index === completed;
        return <li key={label} data-state={done ? 'complete' : current ? 'current' : 'pending'} aria-current={current ? 'step' : undefined}>
          <span className="consultation-step-dot" aria-hidden="true">{done ? <Check size={20} strokeWidth={3} /> : index + 1}</span>
          <div className="consultation-step-text">
            <span className="consultation-step-number">Paso {index + 1}</span>
            <span className="consultation-step-label">{label}</span>
            <span className="consultation-step-status">{done ? 'Completado' : current ? 'Estás aquí' : 'Pendiente'}</span>
          </div>
        </li>;
      })}
    </ol>
    <p role="status" className="consultation-progress-hint">{guidance}</p>
  </div>;
}
