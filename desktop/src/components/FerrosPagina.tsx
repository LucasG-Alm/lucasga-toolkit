import { useState } from 'react';
import type { ToolkitAPI } from '../../shared/contracts';
import { CotarPanel } from './CotarPanel';
import { FerrosPanel, type Chegada } from './FerrosPanel';

// R-FER-COT-010: as duas abas ficam montadas; trocar só esconde, então nada se perde.
export function FerrosPagina({ api, onError }: { api: ToolkitAPI; onError(value: unknown): void }) {
  const [aba, setAba] = useState<'contar' | 'cotar'>('contar');
  const [chegada, setChegada] = useState<Chegada>();
  const botao = (id: 'contar' | 'cotar', nome: string) => <button role="tab" aria-label={nome} aria-selected={aba === id} className="ferros-aba" onClick={() => setAba(id)}>{nome}<small>{id === 'contar' ? 'ler e listar' : 'criar tags'}</small></button>;
  return <div className="ferros-screen">
    <div role="tablist" className="ferros-abas">{botao('contar', 'Contar')}{botao('cotar', 'Cotar')}</div>
    <div hidden={aba !== 'contar'}><FerrosPanel api={api} onError={onError} chegada={chegada} /></div>
    <div hidden={aba !== 'cotar'}><CotarPanel api={api} onError={onError} onContar={(grade, desenho) => { setChegada({ grade, desenho }); setAba('contar'); }} /></div>
  </div>;
}
