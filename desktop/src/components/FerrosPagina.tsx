import { useState } from 'react';
import type { ToolkitAPI } from '../../shared/contracts';
import { ConferirPanel } from './ConferirPanel';
import { CotarPanel } from './CotarPanel';
import { FerrosPanel, type Chegada } from './FerrosPanel';

// R-FER-COT-010: as abas ficam montadas; trocar só esconde, então nada se perde.
type Aba = 'contar' | 'cotar' | 'conferir';
const DICA: Record<Aba, string> = { contar: 'ler e listar', cotar: 'criar tags', conferir: 'cota × chamada × detalhe' };

export function FerrosPagina({ api, onError }: { api: ToolkitAPI; onError(value: unknown): void }) {
  const [aba, setAba] = useState<Aba>('contar');
  const [chegada, setChegada] = useState<Chegada>();
  const botao = (id: Aba, nome: string) => <button role="tab" aria-label={nome} aria-selected={aba === id} className="ferros-aba" onClick={() => setAba(id)}>{nome}<small>{DICA[id]}</small></button>;
  return <div className="ferros-screen">
    <div role="tablist" className="ferros-abas">{botao('contar', 'Contar')}{botao('cotar', 'Cotar')}{botao('conferir', 'Conferir')}</div>
    <div hidden={aba !== 'contar'}><FerrosPanel api={api} onError={onError} chegada={chegada} /></div>
    <div hidden={aba !== 'cotar'}><CotarPanel api={api} onError={onError} onContar={(grade, desenho) => { setChegada({ grade, desenho }); setAba('contar'); }} /></div>
    <div hidden={aba !== 'conferir'}><ConferirPanel api={api} onError={onError} /></div>
  </div>;
}
